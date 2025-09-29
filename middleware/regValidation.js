import { body } from "express-validator";

export const registerValidation = [
  body("name")
    .isLength({ min: 3 })
    .withMessage("Username must be at least 3 characters long"),
  body("email")
    .isEmail()
    .withMessage("Email is invalid")
    .normalizeEmail(), // sanitize
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
];


 export const loginValidation = [
  body("email")
    .isEmail()
    .withMessage("Email is invalid")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password cannot be empty"),
];




