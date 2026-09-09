import { expect, it } from 'vitest';
import { createDeletionReceipt, verifyDeletionReceipt } from './deletionReceipt';
it('accepts only a signed, unexpired receipt for the same secret', () => {
  const receipt = createDeletionReceipt('user-a', 'test-secret', 1000);
  expect(verifyDeletionReceipt(receipt, 'test-secret', 2000)).toBe('user-a');
  expect(verifyDeletionReceipt(receipt, 'different-secret', 2000)).toBeNull();
  expect(verifyDeletionReceipt(receipt, 'test-secret', 3601000)).toBeNull();
  expect(verifyDeletionReceipt(receipt.replace(/^./, 'x'), 'test-secret', 2000)).toBeNull();
  expect(verifyDeletionReceipt('invalid', 'test-secret', 2000)).toBeNull();
});
