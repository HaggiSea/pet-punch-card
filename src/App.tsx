import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import type { Profile } from './lib/types';
import ParentDashboard from './pages/ParentDashboard';
import ChildDashboard from './pages/ChildDashboard';
import './App.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // 声明在 effect 之前，否则 effect 里引用的是尚未初始化的绑定
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ 获取 profile 失败:', error);
      return;
    }

    // family_id 是本次重构新增的列，老账号为 null。
    // 家长端所有查询都按 family_id 过滤，缺了会一条数据都查不到，
    // 所以这里自愈：家长补自己的 id 作为家庭标识，孩子必须由家长绑定。
    if (!data.family_id && data.role === 'parent') {
      const { data: fixed, error: fixErr } = await supabase
        .from('profiles')
        .update({ family_id: userId })
        .eq('id', userId)
        .select()
        .single();

      if (fixErr) {
        console.error('❌ 初始化家庭失败:', fixErr);
        setProfile(data);
      } else {
        setProfile(fixed);
      }
      return;
    }

    setProfile(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener?.subscription.unsubscribe();
  }, [fetchProfile]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-lg">加载中...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <Navigate to="/dashboard" /> : <LoginPage />} />
        <Route
          path="/dashboard"
          element={
            session ? (
              profile ? (
                profile.role === 'parent' ? (
                  <ParentDashboard profile={profile} />
                ) : (
                  <ChildDashboard profile={profile} />
                )
              ) : (
                <div className="min-h-screen flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-gray-500">加载用户信息中...</p>
                    <button 
                      onClick={() => window.location.reload()} 
                      className="mt-2 text-blue-500 underline"
                    >
                      重新加载
                    </button>
                  </div>
                </div>
              )
            ) : (
              <Navigate to="/" />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

// ========== 登录页面组件 ==========
function LoginPage() {
  // null = 尚未加载完成，用它表达加载态，省掉一个同步 setState 的 loading 变量
  const [users, setUsers] = useState<{ id: string; username: string }[] | null>(null);
  const [pickedUser, setPickedUser] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'parent' | 'child'>('parent');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('role', role);
    if (error) {
      console.error('获取用户列表失败:', error);
      setUsers([]);
    } else {
      setUsers(data || []);
    }
    setPickedUser('');
  }

  useEffect(() => {
    if (!isSignUp) {
      // loadUsers 的 setState 全部发生在 await 之后，不是同步级联渲染；
      // set-state-in-effect 识别不了 async 边界，此处为误报。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadUsers();
    }
    // loadUsers 依赖 role，随 role/isSignUp 变化重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignUp, role]);

  const isLoadingUsers = users === null;
  // 未手动选择时默认第一个账号：派生值，避免 effect 回写 state
  const selectedUser = pickedUser || users?.[0]?.id || '';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignUp) {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const newUsername = formData.get('newUsername') as string;
      const familyCode = ((formData.get('familyCode') as string) || '').trim();

      if (!newUsername || newUsername.trim().length === 0) {
        setError('请输入用户名');
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        setError('密码至少6位');
        setLoading(false);
        return;
      }

      // 孩子必须归入某个家庭：数据库触发器按家庭代码（= 家长用户名）查家长，
      // 这里先校验一次，避免注册成功后才发现挂错家庭。
      if (role === 'child') {
        if (!familyCode) {
          setError('请输入家庭代码（家长的用户名）');
          setLoading(false);
          return;
        }

        const { data: parent, error: parentError } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'parent')
          .ilike('username', familyCode)
          .maybeSingle();

        if (parentError) {
          setError('校验家庭代码失败：' + parentError.message);
          setLoading(false);
          return;
        }

        if (!parent) {
          setError(`找不到家长账号「${familyCode}」，请向家长确认用户名`);
          setLoading(false);
          return;
        }
      }

      const email = newUsername.trim() + '@' + role + '.pet';

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: newUsername.trim(),
            role: role,
            // 家长自成一家，family_code 仅对孩子有意义
            ...(role === 'child' ? { family_code: familyCode } : {}),
          }
        }
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        alert(
          role === 'child'
            ? '✅ 注册成功！请让家长在家长端点「+ 添加孩子」创建宠物档案。'
            : '✅ 注册成功！请使用该角色登录。'
        );
        setIsSignUp(false);
        setPassword('');
        loadUsers();
      }
      setLoading(false);
      return;
    }

    if (!selectedUser) {
      setError('请选择一个账号');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('密码至少6位');
      setLoading(false);
      return;
    }

    const user = users?.find(u => u.id === selectedUser);
    if (!user) {
      setError('账号不存在');
      setLoading(false);
      return;
    }

    const email = user.username + '@' + role + '.pet';

    const { error: signInError } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (signInError) {
      setError(signInError.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold text-center mb-6">🐾 打卡宠物</h1>
        <form onSubmit={handleSubmit}>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="role"
                value="parent"
                checked={role === 'parent'}
                onChange={() => setRole('parent')}
              />
              👨‍👩‍👦 家长
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="role"
                value="child"
                checked={role === 'child'}
                onChange={() => setRole('child')}
              />
              🧒 孩子
            </label>
          </div>

          {!isSignUp && (
            <div className="mb-3">
              <select
                className="w-full p-2 border rounded"
                value={selectedUser}
                onChange={(e) => setPickedUser(e.target.value)}
                disabled={isLoadingUsers}
              >
                <option value="">-- 请选择账号 --</option>
                {(users ?? []).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
              {users?.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  暂无 {role === 'parent' ? '家长' : '孩子'} 账号，请先注册
                </p>
              )}
            </div>
          )}

          {isSignUp && (
            <input
              type="text"
              name="newUsername"
              placeholder="新用户名（字母或数字）"
              className="w-full p-2 border rounded mb-3"
              required
            />
          )}

          {/* 孩子注册必须指明加入哪个家庭，代码就是家长的用户名 */}
          {isSignUp && role === 'child' && (
            <div className="mb-3">
              <input
                type="text"
                name="familyCode"
                placeholder="家庭代码（家长的用户名）"
                className="w-full p-2 border rounded"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                问家长他登录时用的用户名，填在这里就能加入同一个家庭
              </p>
            </div>
          )}

          <input
            type="password"
            placeholder="密码（至少6位）"
            className="w-full p-2 border rounded mb-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <button 
            type="submit" 
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
            disabled={loading}
          >
            {loading ? '处理中...' : (isSignUp ? '注册' : '登录')}
          </button>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>
        
        <p className="text-center text-sm mt-4">
          {isSignUp ? '已有账号？' : '还没有账号？'}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
              if (!isSignUp) {
                setUsers(null);
                setPickedUser('');
              } else {
                loadUsers();
              }
            }}
            className="text-blue-500 underline ml-1"
          >
            {isSignUp ? '去登录' : '去注册'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default App;