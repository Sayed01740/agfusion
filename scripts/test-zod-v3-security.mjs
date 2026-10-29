#!/usr/bin/env node
import * as z from "zod/v3";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let arrayElementsVisited = 0;
const element = z.any().superRefine(() => {
  arrayElementsVisited += 1;
});
const oversizedArray = z.array(element).max(8).safeParse(Array.from({ length: 256 }, (_, i) => i));
assert(!oversizedArray.success, "oversized bounded array should fail");
assert(
  arrayElementsVisited === 0,
  `bounded array parsed ${arrayElementsVisited} elements before rejecting an oversized input`,
);

let exactArrayElementsVisited = 0;
const exactArrayElement = z.any().superRefine(() => {
  exactArrayElementsVisited += 1;
});
const wrongExactLengthArray = z.array(exactArrayElement).length(8).safeParse(
  Array.from({ length: 256 }, (_, i) => i),
);
assert(!wrongExactLengthArray.success, "array violating exact length should fail");
assert(
  exactArrayElementsVisited === 0,
  `exact-length array parsed ${exactArrayElementsVisited} elements before rejecting an oversized input`,
);

let setElementsVisited = 0;
const setElement = z.any().superRefine(() => {
  setElementsVisited += 1;
});
const oversizedSet = z.set(setElement).max(8).safeParse(new Set(Array.from({ length: 256 }, (_, i) => i)));
assert(!oversizedSet.success, "oversized bounded set should fail");
assert(
  setElementsVisited === 0,
  `bounded set parsed ${setElementsVisited} elements before rejecting an oversized input`,
);

console.log("PASS: Zod v3-compat bounded arrays and sets reject oversized input before element validation.");
