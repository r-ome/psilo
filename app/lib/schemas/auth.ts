import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    given_name: z
      .string()
      .min(2, "First Name must be at least 2 characters")
      .max(50, "First Name must be at least 50 characters"),
    family_name: z
      .string()
      .min(2, "Last Name must be at least 2 characters")
      .max(50, "Last Name must be at least 50 characters"),
    phone_number: z
      .string()
      .regex(
        /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
        "Invalid phone number format",
      ),
    email: z.string().email("Must be a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const confirmSignUpSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  confirmationCode: z.string(),
});
export type ConfirmSignUpInput = z.infer<typeof confirmSignUpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Must be a valid email address"),
});

export const confirmForgotPasswordSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  confirmationCode: z.string(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});
export type ConfirmForgotPasswordInput = z.infer<
  typeof confirmForgotPasswordSchema
>;
