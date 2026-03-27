"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardAction,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/app/context/AuthContext";
import { loginSchema } from "@/app/lib/schemas/auth";
import { AuthNav } from "@/app/(auth)/components/AuthNav";

const LoginPage = () => {
  const auth = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    const formData = new FormData(event.currentTarget);
    const data = {
      email: formData.get("email"),
      password: formData.get("password"),
    };

    const inputValidate = loginSchema.safeParse(data);

    if (!inputValidate.success) {
      const fieldErrors: Record<string, string> = {};
      inputValidate.error.issues.forEach((issue) => {
        const path = issue.path.join(" ");
        fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      setIsLoading(false);
      return;
    }

    try {
      await auth.handleLogin(
        inputValidate.data.email,
        inputValidate.data.password,
      );
      toast.success("Successfully logged in!");
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login Failed";
      toast.error(message);
    } finally {
      setErrors({});
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AuthNav />
      <div className="flex items-center justify-center py-16">
      <div className="w-1/3">
        <Card>
          <CardHeader>
            <CardTitle>Login to your account</CardTitle>
            <CardDescription>
              Enter email below to login to your account
            </CardDescription>
            <CardAction>
              <Button variant="link" tabIndex={-1}>
                <Link href="/sign-up" tabIndex={-1}>
                  Sign Up
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form id="login-form" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="email@gmail.com"
                    disabled={isLoading}
                    error={errors}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="forgot-password"
                      tabIndex={-1}
                      className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="********************"
                    error={errors}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
            </form>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              form="login-form"
              type="submit"
              className="w-full cursor-pointer"
              disabled={isLoading}
            >
              {isLoading && <Loader2Icon className="animate-spin" />}
              Login
            </Button>
          </CardFooter>
        </Card>
      </div>
      </div>
    </div>
  );
};

export default LoginPage;
