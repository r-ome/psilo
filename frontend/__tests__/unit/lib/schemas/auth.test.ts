import {
  loginSchema,
  signUpSchema,
  confirmSignUpSchema,
  forgotPasswordSchema,
  confirmForgotPasswordSchema,
} from "@/app/lib/schemas/auth";

describe("auth.ts", () => {
  describe("loginSchema", () => {
    it("returns error when email is missing", () => {
      const body = { password: "12345678" };
      const { error } = loginSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Email is required");
    });

    it("returns error when email is invalid", () => {
      const body = { email: "not-a-valid-email", password: "12345678" };
      const { error } = loginSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Must be a valid email address");
    });

    it("returns error when password is missing", () => {
      const body = { email: "test@test.com" };
      const { error } = loginSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Password is required");
    });

    it("returns error when password is less than 8 characters", () => {
      const body = { email: "test@test.com", password: "1234567" };
      const { error } = loginSchema.safeParse(body);
      expect(error?.issues[0].message).toBe(
        "Password must be at least 8 characters",
      );
    });

    it("returns success = true when inputs are valid", () => {
      const body = { email: "test@test.com", password: "12345678" };
      const { success } = loginSchema.safeParse(body);
      expect(success).toBe(true);
    });
  });

  describe("signUpSchema", () => {
    describe("given_name field", () => {
      it("returns error when given_name is missing", () => {
        const body = {
          family_name: "Test",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "ThisisV4lid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("First Name is required");
      });

      it("returns error when given_name is less than 2 characters", () => {
        const body = {
          given_name: "a",
          family_name: "Test",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "ThisisV4lid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe(
          "First Name must be at least 2 characters",
        );
      });

      it("returns error when given_name is more than 50 characters", () => {
        const body = {
          given_name: "a".repeat(51),
          family_name: "Test",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "ThisisV4lid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe(
          "First Name must be at least 50 characters",
        );
      });
    });

    describe("family_name field", () => {
      it("returns error when family_name is missing", () => {
        const body = {
          given_name: "John",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Last Name is required");
      });

      it("returns error when family_name is less than 2 characters", () => {
        const body = {
          given_name: "John",
          family_name: "a",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe(
          "Last Name must be at least 2 characters",
        );
      });

      it("returns error when family_name is more than 50 characters", () => {
        const body = {
          given_name: "John",
          family_name: "a".repeat(51),
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe(
          "Last Name must be at least 50 characters",
        );
      });
    });

    describe("phone_number field", () => {
      it("returns error when phone_number is missing", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          email: "test@test.com",
          password: "ThisisV4lid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Phone Number is required");
      });

      it("returns error when phone_number invalid format", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "!@#09999999999",
          email: "test@test.com",
          password: "ThisisV4lid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Invalid phone number format");
      });
    });

    describe("email field", () => {
      it("returns error when email is missing", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "+639999999999",
          password: "ThisisV4lid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Email is required");
      });

      it("returns error when email is invalid", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "09999999999",
          email: "test.com",
          password: "ThisisV4lid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Must be a valid email address");
      });
    });

    describe("password field", () => {
      it("returns error when password is missing", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Password is required");
      });

      it("returns error when password has less than 8 characters", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "09999999999",
          email: "test@test.com",
          password: "Invalid",
          confirm_password: "ThisisV4lid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe(
          "Password must be at least 8 characters",
        );
      });

      it("returns error when password has no uppercase letter", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "invalidpassword1",
          confirm_password: "invalidpassword1",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Must contain uppercase letter");
      });

      it("returns error when password has no number", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "Invalidpassword",
          confirm_password: "Invalidpassword",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Must contain a number");
      });
    });

    describe("confirm_password field", () => {
      it("returns error when password is missing", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "Th1sIsValid",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Confirm Password is required");
      });

      it("returns error when password does not match with confirm_password", () => {
        const body = {
          given_name: "John",
          family_name: "Doe",
          phone_number: "09999999999",
          email: "test@test.com",
          password: "ThisMustM4tch",
          confirm_password: "ThisMustMAtch",
        };
        const { error } = signUpSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Passwords don't match");
      });
    });

    it("returns no error when given_name is valid", () => {
      const body = {
        given_name: "John",
        family_name: "Doe",
        phone_number: "+639999999999",
        email: "test@test.com",
        password: "ThisisV4lid",
        confirm_password: "ThisisV4lid",
      };
      const { success } = signUpSchema.safeParse(body);
      expect(success).toBe(true);
    });
  });

  describe("confirmSignUpSchema", () => {
    it("returns error when email is missing", () => {
      const body = { confirmationCode: "123456" };
      const { error } = confirmSignUpSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Email is required");
    });

    it("returns error when email is invalid", () => {
      const body = { email: "test.com", confirmationCode: "123456" };
      const { error } = confirmSignUpSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Must be a valid email address");
    });

    it("returns error when confirmationCode is missing", () => {
      const body = { email: "test@test.com" };
      const { error } = confirmSignUpSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Confirmation Code is required");
    });

    it("returns no error when inputs are valid", () => {
      const body = { email: "test@test.com", confirmationCode: "123456" };
      const { success } = confirmSignUpSchema.safeParse(body);
      expect(success).toBe(true);
    });
  });

  describe("forgotPasswordSchema", () => {
    it("returns error when email is missing", () => {
      const body = {};
      const { error } = forgotPasswordSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Email is required");
    });

    it("returns no error when inputs are valid", () => {
      const body = { email: "test@test.com" };
      const { success } = forgotPasswordSchema.safeParse(body);
      expect(success).toBe(true);
    });
  });

  describe("confirmForgotPasswordSchema", () => {
    it("returns error when email is missing", () => {
      const body = { confirmationCode: "123456", password: "Th1sIsValid" };
      const { error } = confirmForgotPasswordSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Email is required");
    });

    it("returns error when email is invalid", () => {
      const body = {
        email: "test.com",
        confirmationCode: "123456",
        password: "Th1sIsValid",
      };
      const { error } = confirmForgotPasswordSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Must be a valid email address");
    });

    it("returns error when confirmationCode is missing", () => {
      const body = { email: "test@test.com", password: "Th1sIsValid" };
      const { error } = confirmForgotPasswordSchema.safeParse(body);
      expect(error?.issues[0].message).toBe("Confirmation Code is required");
    });

    describe("password field", () => {
      it("returns error when password is missing", () => {
        const body = {
          email: "test@test.com",
          confirmationCode: "ThisisV4lid",
        };
        const { error } = confirmForgotPasswordSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Password is required");
      });

      it("returns error when password has less than 8 characters", () => {
        const body = {
          email: "test@test.com",
          confirmationCode: "123456",
          password: "Invalid",
        };
        const { error } = confirmForgotPasswordSchema.safeParse(body);
        expect(error?.issues[0].message).toBe(
          "Password must be at least 8 characters",
        );
      });

      it("returns error when password has no uppercase letter", () => {
        const body = {
          email: "test@test.com",
          confirmationCode: "1234567",
          password: "invalidpassword1",
        };
        const { error } = confirmForgotPasswordSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Must contain uppercase letter");
      });

      it("returns error when password has no number", () => {
        const body = {
          email: "test@test.com",
          confirmationCode: "1234567",
          password: "Invalidpassword",
        };
        const { error } = confirmForgotPasswordSchema.safeParse(body);
        expect(error?.issues[0].message).toBe("Must contain a number");
      });
    });

    it("returns no error when inputs are valid", () => {
      const body = {
        email: "test@test.com",
        confirmationCode: "123456",
        password: "Th1sIsValid",
      };
      const { success } = confirmForgotPasswordSchema.safeParse(body);
      expect(success).toBe(true);
    });
  });
});
