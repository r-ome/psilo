"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "../lib/services/auth.services";

type AuthContextValue = {
  isAuthenticated: boolean;
  handleLogin: (email: string, password: string) => Promise<void>;
  handleLogout: () => Promise<void>;
};

const initialValue: AuthContextValue = {
  isAuthenticated: false,
  handleLogin: async (_email: string, _password: string) => {},
  handleLogout: async () => {},
};

const AuthContext = createContext<AuthContextValue>(initialValue);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    authService.getSession().then(({ isAuthenticated }) => {
      setIsAuthenticated(isAuthenticated);
    });
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const body = { email, password };
    await authService.login(body);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    authService.logout();
    setIsAuthenticated(false);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, handleLogin, handleLogout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
