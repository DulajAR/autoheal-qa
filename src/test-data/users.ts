
export const testUsers = {
  valid: {
    username: "tomsmith",
    password: "SuperSecretPassword!",
  },

  invalid: {
    username: "invalid_user",
    password: "invalid_password",
  },
} as const;
