import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const signingKeyEntry = require.resolve("@ethersproject/signing-key");
const ellipticEntry = require.resolve("elliptic", {
  paths: [dirname(signingKeyEntry)],
});
const elliptic = require(ellipticEntry);
const HmacDRBG = require(require.resolve("hmac-drbg", {
  paths: [dirname(ellipticEntry)],
}));
const BN = require("bn.js");

const ec = new elliptic.ec("p521");
const privateKey = ec.keyFromPrivate("1");
const message = "deadbeef";
const messageBN = new BN(message, 16);
const rawNonce = new Array(ec.n.byteLength()).fill(0);
rawNonce[0] = 0x00;
rawNonce[1] = 0x01;
for (let i = 2; i < rawNonce.length; i += 1) {
  rawNonce[i] = (0x21 + i * 7) & 0xff;
}

const expectedK = new BN(rawNonce).ushrn(
  rawNonce.length * 8 - ec.n.bitLength(),
);
assert(expectedK.cmpn(1) > 0, "test nonce must be greater than one");
assert(expectedK.cmp(ec.n) < 0, "test nonce must be below the curve order");

const point = ec.g.mul(expectedK);
const expectedR = point.getX().umod(ec.n);
const expectedS = expectedK
  .invm(ec.n)
  .mul(expectedR.mul(privateKey.getPrivate()).add(messageBN))
  .umod(ec.n);

const originalGenerate = HmacDRBG.prototype.generate;
let generatedNonceCount = 0;
HmacDRBG.prototype.generate = function generateWithControlledLeadingZero(length, enc) {
  if (length === rawNonce.length && generatedNonceCount === 0) {
    generatedNonceCount += 1;
    return rawNonce.slice();
  }
  return originalGenerate.call(this, length, enc);
};

try {
  const signature = ec.sign(message, privateKey);
  assert.equal(generatedNonceCount, 1, "signing must consume the injected raw DRBG bytes");
  assert.equal(
    signature.r.toString(16),
    expectedR.toString(16),
    "r must match the independently calculated ECDSA result for the truncated raw nonce",
  );
  assert.equal(
    signature.s.toString(16),
    expectedS.toString(16),
    "s must match the independently calculated ECDSA result for the truncated raw nonce",
  );
  assert.equal(ec.verify(message, signature, privateKey), true, "signature must verify");
  console.log("PASS: P-521 signing preserves raw DRBG byte length for a leading-zero nonce.");
} finally {
  HmacDRBG.prototype.generate = originalGenerate;
}
