import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import ParentDashboard from './pages/ParentDashboard';
import ChildDashboard from './pages/ChildDashboard';
import './App.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('🔍 获取 session:', session);
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔍 认证状态变化:', session);
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    console.log('🔍 正在获取 profile, userId:', userId);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ 获取 profile 失败:', error);
    } else {
      console.log('✅ profile 加载成功:', data);
      setProfile(data);
    }
  }

  console.log('🔍 App 状态:', { session, profile });

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
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'parent' | 'child'>('parent');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  useEffect(() => {
    if (!isSignUp) {
      loadUsers();
    }
  }, [role]);

  async function loadUsers() {
    setIsLoadingUsers(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('role', role);
    if (error) {
      console.error('获取用户列表失败:', error);
    } else {
      setUsers(data || []);
      if (data && data.length > 0) {
        setSelectedUser(data[0].id);
      } else {
        setSelectedUser('');
      }
    }
    setIsLoadingUsers(false);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignUp) {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const newUsername = formData.get('newUsername') as string;
      
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

      const email = newUsername.trim() + '@' + role + '.pet';
      
      const { error: signUpError } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: { 
            username: newUsername.trim(),
            role: role 
          }
        }
      });
      
      if (signUpError) {
        setError(signUpError.message);
      } else {
        alert('✅ 注册成功！请使用该角色登录。');
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

    const user = users.find(u => u.id === selectedUser);
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
                onChange={(e) => setSelectedUser(e.target.value)}
                disabled={isLoadingUsers}
              >
                <option value="">-- 请选择账号 --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
              {users.length === 0 && !isLoadingUsers && (
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
                setUsers([]);
                setSelectedUser('');
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