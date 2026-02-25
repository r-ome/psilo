"use client";

import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { useState, useRef } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import {
  forgotPasswordSchema,
  confirmForgotPasswordSchema,
} from "@/app/lib/schemas/auth";
import { authService } from "@/app/lib/services/auth.services";
import {
  FORGOT_PASSWORD_STEPS,
  type ForgotPasswordStep,
} from "@/app/lib/constants/auth";
import { toast } from "sonner";

const ForgotPasswordPage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<ForgotPasswordStep>(
    FORGOT_PASSWORD_STEPS.FORGOT_PASSWORD,
  );
  const [email, setEmail] = useState<string>("");
  const [confirmationCode, setConfirmationCode] = useState<string>("");
  const confirmationCodeRef = useRef<HTMLInputElement>(null);

  const handleForgotPassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    const formData = new FormData(event.currentTarget);
    const data = {
      email: formData.get("email"),
    };
    const inputValidate = forgotPasswordSchema.safeParse(data);

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
      const body = { email: inputValidate.data.email };
      await authService.forgotPassword(body);
      setEmail(inputValidate.data.email);
      setStep(FORGOT_PASSWORD_STEPS.CONFIRM);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Forgot Password Failed!";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmForgotPassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    if (!email) return;
    try {
      const formData = new FormData(event.currentTarget);

      const data = {
        email,
        confirmationCode,
        password: formData.get("password"),
      };

      const inputValidate = confirmForgotPasswordSchema.safeParse(data);
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

      await authService.confirmForgotPassword(inputValidate.data);
      toast.success("Successfully Updated Password!");
      router.push("/login");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Confirming Sign Up Failed!";

      if (message.toUpperCase() === "INVALID VERIFICATION CODE.") {
        setStep(FORGOT_PASSWORD_STEPS.CONFIRM);
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
      setErrors({});
    }
  };

  const ForgotPasswordStep = () => {
    return (
      <CardContent>
        <form id="forgot-password-form" onSubmit={handleForgotPassword}>
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
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
          </div>
        </form>
      </CardContent>
    );
  };

  const ConfirmationStep = () => {
    return (
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="grid gap-2">
            <Input
              id="confirmation_code"
              name="confirmation_code"
              ref={confirmationCodeRef}
              type="text"
              placeholder="Confirmation Code"
              disabled={isLoading}
              required
            />
          </div>
          <div className="w-full flex flex-row justify-end">
            <Button
              type="button"
              variant="link"
              className="text-xs underline hover:cursor-pointer w-fit"
              size="xs"
              onClick={async () => await authService.forgotPassword({ email })}
            >
              Resend Confirmation Code
            </Button>
          </div>
        </div>
      </CardContent>
    );
  };

  const SetNewPasswordStep = () => {
    return (
      <CardContent>
        <form
          id="confirm-forgot-password-form"
          onSubmit={handleConfirmForgotPassword}
          autoComplete="off"
        >
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Input your new password"
                disabled={isLoading}
                autoComplete="off"
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
              {step === FORGOT_PASSWORD_STEPS.FORGOT_PASSWORD
                ? "Forgot Password"
                : "Check your email for verification"}
            </CardTitle>
            <CardDescription>
              {step === FORGOT_PASSWORD_STEPS.FORGOT_PASSWORD &&
                "Please enter your email."}
              {step === FORGOT_PASSWORD_STEPS.CONFIRM &&
                "We've sent you a verification code in your email."}
              {step === FORGOT_PASSWORD_STEPS.NEW_PASSWORD &&
                "Please enter your new password."}
            </CardDescription>
          </CardHeader>
          {step === FORGOT_PASSWORD_STEPS.FORGOT_PASSWORD && (
            <ForgotPasswordStep />
          )}
          {step === FORGOT_PASSWORD_STEPS.CONFIRM && <ConfirmationStep />}
          {step === FORGOT_PASSWORD_STEPS.NEW_PASSWORD && (
            <SetNewPasswordStep />
          )}
          <CardFooter className="flex-col gap-2">
            {step === FORGOT_PASSWORD_STEPS.FORGOT_PASSWORD && (
              <Button
                form="forgot-password-form"
                type="submit"
                className="w-full cursor-pointer"
                disabled={isLoading}
              >
                {isLoading && <Loader2Icon className="animate-spin" />}
                Send Forgot Password Code
              </Button>
            )}

            {step === FORGOT_PASSWORD_STEPS.CONFIRM && (
              <Button
                type="submit"
                className="w-full cursor-pointer"
                onClick={() => {
                  const value = confirmationCodeRef.current?.value ?? "";
                  setConfirmationCode(value);
                  setStep(FORGOT_PASSWORD_STEPS.NEW_PASSWORD);
                }}
                disabled={isLoading}
              >
                {isLoading && <Loader2Icon className="animate-spin" />}
                Confirm Code
              </Button>
            )}

            {step === FORGOT_PASSWORD_STEPS.NEW_PASSWORD && (
              <Button
                form="confirm-forgot-password-form"
                type="submit"
                className="w-full cursor-pointer"
                disabled={isLoading}
              >
                {isLoading && <Loader2Icon className="animate-spin" />}
                Reset Password
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
