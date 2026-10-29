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

const hash = require(require.resolve("hash.js", {
  paths: [dirname(ellipticEntry)],
}));
const p256 = new elliptic.ec({
  curve: elliptic.curves.p256,
  hash: hash.sha256,
});
const rfc6979PrivateKey =
  "c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721";
const rfc6979PublicKey = {
  x: "60fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6",
  y: "7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299",
};
const rfc6979Digest = hash.sha256().update("sample").digest();
const rfc6979Signature = p256.sign(rfc6979Digest, rfc6979PrivateKey);
assert.equal(
  rfc6979Signature.r.toString(16),
  "efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716",
  "P-256 RFC 6979 SHA-256 known-answer r vector must match",
);
assert.equal(
  rfc6979Signature.s.toString(16),
  "f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8",
  "P-256 RFC 6979 SHA-256 known-answer s vector must match",
);
assert.equal(
  p256.verify(rfc6979Digest, rfc6979Signature, rfc6979PublicKey),
  true,
  "P-256 RFC 6979 known-answer signature must verify",
);
console.log("PASS: P-256 RFC 6979 SHA-256 known-answer signature matches r/s and verifies.");
