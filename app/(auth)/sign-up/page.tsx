"use client";

import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { signUpSchema } from "@/app/lib/schemas/auth";
import { authService } from "@/app/lib/services/auth.services";
import { SIGNUP_STEPS, type SignUpStep } from "@/app/lib/constants/auth";
import { toast } from "sonner";

const SignUpPage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<SignUpStep>(SIGNUP_STEPS.SIGNUP);
  const [email, setEmail] = useState<string>("");

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    const formData = new FormData(event.currentTarget);
    const data = {
      given_name: formData.get("given_name"),
      family_name: formData.get("family_name"),
      email: formData.get("email"),
      phone_number: formData.get("phone_number"),
      password: formData.get("password"),
      confirm_password: formData.get("confirm_password"),
    };
    const inputValidate = signUpSchema.safeParse(data);

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
      await authService.signup(inputValidate.data);
      setEmail(inputValidate.data.email);
      setStep(SIGNUP_STEPS.CONFIRM);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sign Up Failed!";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSignUp = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    if (!email) return;
    try {
      const formData = new FormData(event.currentTarget);
      const code = formData.get("confirmation_code");

      if (!code) {
        setErrors({ confirmation_code: "This field is required!" });
        setIsLoading(false);
        return;
      }

      const res = await authService.confirmSignUp(email, code as string);
      if (res) {
        toast.success("Successfully Registered Account!");
        router.push("/login");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Confirming Sign Up Failed!";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const ConfirmationStep = () => {
    return (
      <CardContent>
        <form
          id="confirm-sign-up-form"
          onSubmit={handleConfirmSignUp}
          autoComplete="off"
        >
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Input
                id="confirmation_code"
                name="confirmation_code"
                type="text"
                placeholder="Confirmation Code"
                disabled={isLoading}
                required
              />
            </div>
          </div>
        </form>
      </CardContent>
    );
  };

  const SignUpStep = () => {
    return (
      <CardContent>
        <form id="sign-up-form" onSubmit={handleSignUp} autoComplete="off">
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="given_name">First Name</Label>
              <Input
                id="given_name"
                name="given_name"
                type="text"
                placeholder="John"
                disabled={isLoading}
                error={errors}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="family_name">Last Name</Label>
              <Input
                id="family_name"
                name="family_name"
                type="text"
                placeholder="Doe"
                disabled={isLoading}
                error={errors}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="email@gmail.com"
                disabled={isLoading}
                autoComplete="off"
                error={errors}
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="phone_number">Phone Number</Label>
              </div>
              <Input
                id="phone_number"
                name="phone_number"
                placeholder="+639 12 345 8282"
                disabled={isLoading}
                error={errors}
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="********************"
                disabled={isLoading}
                autoComplete="new-password"
                error={errors}
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="confirm_password">Confirm Password</Label>
              </div>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                placeholder="********************"
                disabled={isLoading}
                autoComplete="new-password"
                error={errors}
                required
              />
            </div>
          </div>
        </form>
      </CardContent>
    );
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-1/3">
        <Card>
          <CardHeader>
            <CardTitle>
              {step === SIGNUP_STEPS.SIGNUP
                ? "Create an account"
                : "Check your email for verification"}
            </CardTitle>
            <CardDescription>
              {step === SIGNUP_STEPS.SIGNUP
                ? "Create a new account."
                : "We've sent you a verification code in your email."}
            </CardDescription>
          </CardHeader>
          {step === SIGNUP_STEPS.SIGNUP ? <SignUpStep /> : <ConfirmationStep />}
          <CardFooter className="flex-col gap-2">
            {step === SIGNUP_STEPS.SIGNUP ? (
              <Button
                form="sign-up-form"
                type="submit"
                className="w-full cursor-pointer"
                disabled={isLoading}
              >
                {isLoading && <Loader2Icon className="animate-spin" />}
                Sign Up
              </Button>
            ) : (
              <Button
                form="confirm-sign-up-form"
                type="submit"
                className="w-full cursor-pointer"
                disabled={isLoading}
              >
                {isLoading && <Loader2Icon className="animate-spin" />}
                Confirm Sign Up
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default SignUpPage;
