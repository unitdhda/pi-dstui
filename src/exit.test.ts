import { expect, test } from "bun:test";
import { isKillerInput } from "./exit.ts";

test("killer inputs include ctrl+c and ctrl+d raw bytes", () => {
  expect(isKillerInput("\u0003")).toBe(true);
  expect(isKillerInput("\u0004")).toBe(true);
});

test("killer inputs include ctrl+c and ctrl+d symbolic names", () => {
  expect(isKillerInput("ctrl+c")).toBe(true);
  expect(isKillerInput("ctrl+d")).toBe(true);
  expect(isKillerInput("CTRL+C")).toBe(true);
  expect(isKillerInput("CTRL+D")).toBe(true);
});

test("non-killer inputs are ignored", () => {
  expect(isKillerInput("\u001b")).toBe(false);
  expect(isKillerInput("enter")).toBe(false);
  expect(isKillerInput("x")).toBe(false);
});
