import { newTree } from './new_tree.js';
import { Level } from "level";
import { PoseidonHasher } from './types/index.js';
import { Field, Provable } from 'o1js';
import { StandardTree } from './standard_tree/standard_tree.js';
// create a leveldb for test
let db = new Level('example', { valueEncoding: 'buffer' });
// poseidonHasher from o1js package
let poseidonHasher = new PoseidonHasher();
// tree height: 4
const PRIVATE_DATA_TREE_HEIGHT = 4;
// indicate if need consider the cached leaves, beside the existing leaves.
const includeUncommitted = true;
// create a standard merkle tree instance
const standardTreeInstance = await newTree(StandardTree, db, poseidonHasher, 'privateData', PRIVATE_DATA_TREE_HEIGHT);
console.log('standard tree initial root: ', standardTreeInstance.getRoot(includeUncommitted).toString());
// append the first leaf of type: Field, the newly inserted leaf is kept in an array before being flushed into db.
await standardTreeInstance.appendLeaves([
    Field('20005205046905019185276322150472684212046819894939456380246051296521983948061'),
]);
// before commit, you must get the leaf by specifying 'leafIndex' and 'includeUncommitted' = true
let leaf1 = await standardTreeInstance.getLeafValue(0n, includeUncommitted);
console.log('leaf1: ', leaf1?.toString());
// if you mistake specifying 'includeUncommitted' = false, then got 'undefined'. because the newly inserted leaf is not persisted yet.
leaf1 = await standardTreeInstance.getLeafValue(0n, !includeUncommitted);
console.log('leaf1: ', leaf1);
console.log('after append one leaf, tree root based on all cached&persisted leaves: ', standardTreeInstance.getRoot(includeUncommitted).toString());
let nowRootBeforeCommit = standardTreeInstance.getRoot(!includeUncommitted);
console.log('before commit, tree root based on existing persisted leaves: ', nowRootBeforeCommit.toString());
// persist, i.e. commit the tree into leveldb
await standardTreeInstance.commit();
console.log('exec commit... now all cached leaves are flushed into db and become parts of persisted leaves');
let nowRootAfterCommit = standardTreeInstance.getRoot(!includeUncommitted);
console.log('after commit, tree root based on all persisted leaves: ', nowRootAfterCommit.toString());
// after commit, now you could successfully get the leaf by specifying 'leafIndex' and 'includeUncommitted' = false
leaf1 = await standardTreeInstance.getLeafValue(0n, !includeUncommitted);
console.log('leaf1: ', leaf1);
// go on append several leaves
await standardTreeInstance.appendLeaves([Field(11)]);
await standardTreeInstance.appendLeaves([Field(21)]);
await standardTreeInstance.appendLeaves([Field(31)]);
await standardTreeInstance.appendLeaves([Field(41)]);
await standardTreeInstance.appendLeaves([Field(51)]);
await standardTreeInstance.appendLeaves([Field(61)]);
nowRootBeforeCommit = standardTreeInstance.getRoot(includeUncommitted);
// get merkle witness
const membershipWitness = await standardTreeInstance.getSiblingPath(3n, includeUncommitted);
console.log('witness: ', membershipWitness.toJSON());
// check the membership within circuit
Provable.runAndCheck(() => {
    const root = membershipWitness.calculateRoot(Field(31), Field(3n));
    Provable.log(root);
    Provable.assertEqual(Field, root, nowRootBeforeCommit);
    // verifyMembership(nowRootBeforeCommit, membershipWitness, Field(31), Field(3n))
});
const membershipWitness2 = await standardTreeInstance.getSiblingPath(6n, includeUncommitted);
console.log('witness2: ', membershipWitness2.toJSON());
Provable.runAndCheck(() => {
    const root = membershipWitness2.calculateRoot(Field(0), Field(6n));
    Provable.log('testroot: ', root);
});
await standardTreeInstance.commit();
