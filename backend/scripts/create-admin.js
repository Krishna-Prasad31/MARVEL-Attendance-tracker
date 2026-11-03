
require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/user");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(question);

    let password = "";

    function onData(char) {
      char = char.toString();

      if (char === "\u0003") {
        stdout.write("\n");
        cleanup();
        process.exit(1);
      }

      if (char === "\r" || char === "\n") {
        stdout.write("\n");
        cleanup();
        resolve(password);
        return;
      }

      if (char === "\u007f" || char === "\b") {
        password = password.slice(0, -1);
        return;
      }

      if (char >= " ") {
        password += char;
      }
    }

    function cleanup() {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    }

    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  try {
    await connectDB();

    const existingAdmin = await User.exists({ role: "admin" });

    if (existingAdmin) {
      throw new Error(
        "An admin already exists. Refusing to create another bootstrap admin."
      );
    }

    const name = (await ask("Admin display name: ")).trim();
    const username = (await ask("Admin username: "))
      .trim()
      .toLowerCase();

    if (!name || !username) {
      throw new Error("Name and username are required.");
    }

    if (!/^[a-z0-9._-]{3,100}$/.test(username)) {
      throw new Error(
        "Username must be 3–100 characters using letters, numbers, dots, underscores, or hyphens."
      );
    }

    const password = await askHidden("Admin password (input hidden): ");

    if (password.length < 12) {
      throw new Error("Use a password with at least 12 characters.");
    }

    const confirmPassword = await askHidden("Confirm password: ");

    if (password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await User.create({
      name,
      username,
      passwordHash,
      role: "admin",
      isActive: true,
    });

    console.log(`Admin account "${username}" created successfully.`);
  } catch (error) {
    console.error("Admin setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();

    const mongoose = require("mongoose");
    await mongoose.connection.close().catch(() => {});
  }
}

main();
