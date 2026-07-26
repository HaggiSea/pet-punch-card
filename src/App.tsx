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
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  }

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
              profile?.role === 'parent' ? (
                <ParentDashboard profile={profile} />
              ) : (
                <ChildDashboard profile={profile} />
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

// 登录页面（保持原样）
function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // 构造虚拟邮箱
    const email = username.trim() + '@pet.local';
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        alert('注册成功！请使用同一用户名和密码登录。');
        setIsSignUp(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold text-center mb-6">🐾 打卡宠物</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="用户名（字母或数字）"
            className="w-full p-2 border rounded mb-3"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
            required
          />
          <input
            type="password"
            placeholder="密码（至少6位）"
            className="w-full p-2 border rounded mb-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600">
            {isSignUp ? '注册' : '登录'}
          </button>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>
        <p className="text-center text-sm mt-4">
          {isSignUp ? '已有账号？' : '还没有账号？'}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
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