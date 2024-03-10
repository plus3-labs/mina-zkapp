import { EMPTY_VALUE, SMT_DEPTH } from '../constant.js';
import { PoseidonHasherFunc } from '../model.js';
export { DeepSparseMerkleSubTree };
/**
 * DeepSparseMerkleSubTree is a deep sparse merkle subtree for working on only a few leafs.
 *
 * @class DeepSparseMerkleSubTree
 * @template K
 * @template V
 */
class DeepSparseMerkleSubTree {
    /**
     * Creates an instance of DeepSparseMerkleSubTree.
     * @param {Field} root merkle root
     * @param {Provable<K>} keyType
     * @param {Provable<V>} valueType
     * @param {{ hasher: Hasher; hashKey: boolean; hashValue: boolean }} [options={
     *       hasher: PoseidonHasherFunc,
     *       hashKey: true,
     *       hashValue: true,
     *     }]  hasher: The hash function to use, defaults to PoseidonHasherFunc; hashKey:
     * whether to hash the key, the default is true; hashValue: whether to hash the value,
     * the default is true.
     * @memberof DeepSparseMerkleSubTree
     */
    constructor(root, keyType, valueType, options = {
        hasher: PoseidonHasherFunc,
        hashKey: true,
        hashValue: true,
    }) {
        this.root = root;
        this.nodeStore = new Map();
        this.valueStore = new Map();
        this.hasher = options.hasher;
        this.config = { hashKey: options.hashKey, hashValue: options.hashValue };
        this.keyType = keyType;
        this.valueType = valueType;
    }
    /**
     * Get current root.
     *
     * @return {*}  {Field}
     * @memberof DeepSparseMerkleSubTree
     */
    getRoot() {
        return this.root;
    }
    /**
     * Get height of the tree.
     *
     * @return {*}  {number}
     * @memberof DeepSparseMerkleSubTree
     */
    getHeight() {
        return SMT_DEPTH;
    }
    getKeyField(key) {
        let keyFields = this.keyType.toFields(key);
        let keyHashOrKeyField = keyFields[0];
        if (this.config.hashKey) {
            keyHashOrKeyField = this.hasher(keyFields);
        }
        return keyHashOrKeyField;
    }
    getValueField(value) {
        let valueHashOrValueField = EMPTY_VALUE;
        if (value) {
            let valueFields = this.valueType.toFields(value);
            valueHashOrValueField = valueFields[0];
            if (this.config.hashValue) {
                valueHashOrValueField = this.hasher(valueFields);
            }
        }
        return valueHashOrValueField;
    }
    /**
     * Check whether there is a corresponding key and value in the tree
     *
     * @param {V} value
     * @return {*}  {boolean}
     * @memberof DeepSparseMerkleSubTree
     */
    has(key, value) {
        const keyField = this.getKeyField(key);
        const valueField = this.getValueField(value);
        let v = this.valueStore.get(keyField.toString());
        if (v === undefined || !v.equals(valueField).toBoolean()) {
            return false;
        }
        return true;
    }
    /**
     * Add a branch to the tree, a branch is generated by smt.prove.
     *
     * @param {SparseMerkleProof} proof
     * @param {K} key
     * @param {V} [value]
     * @param {boolean} [ignoreInvalidProof=false] whether to throw an error when proof is invalid
     * @return {*}
     * @memberof DeepSparseMerkleSubTree
     */
    addBranch(proof, key, value, ignoreInvalidProof = false) {
        const keyField = this.getKeyField(key);
        const valueField = this.getValueField(value);
        let { ok, updates } = verifyProofWithUpdates(proof, this.root, keyField, valueField, this.hasher);
        if (!ok) {
            if (!ignoreInvalidProof) {
                throw new Error(`invalid proof, keyField: ${keyField.toString()}, valueField: ${valueField.toString()}`);
            }
            else {
                return;
            }
        }
        for (let i = 0, len = updates.length; i < len; i++) {
            let v = updates[i];
            this.nodeStore.set(v[0].toString(), v[1]);
        }
        this.valueStore.set(keyField.toString(), valueField);
    }
    /**
     * Create a merkle proof for a key against the current root.
     *
     * @param {K} key
     * @return {*}  {SparseMerkleProof}
     * @memberof DeepSparseMerkleSubTree
     */
    prove(key) {
        const path = this.getKeyField(key);
        let pathStr = path.toString();
        let valueHash = this.valueStore.get(pathStr);
        if (valueHash === undefined) {
            throw new Error(`The DeepSubTree does not contain a branch of the path: ${pathStr}`);
        }
        let treeHeight = this.getHeight();
        const pathBits = path.toBits(treeHeight);
        let sideNodes = [];
        let nodeHash = this.root;
        for (let i = 0; i < treeHeight; i++) {
            const currentValue = this.nodeStore.get(nodeHash.toString());
            if (currentValue === undefined) {
                throw new Error('Make sure you have added the correct proof, key and value using the addBranch method');
            }
            if (pathBits[i].toBoolean()) {
                sideNodes.push(currentValue[0]);
                nodeHash = currentValue[1];
            }
            else {
                sideNodes.push(currentValue[1]);
                nodeHash = currentValue[0];
            }
        }
        return { sideNodes, root: this.root };
    }
    /**
     * Update a new value for a key in the tree and return the new root of the tree.
     *
     * @param {K} key
     * @param {V} [value]
     * @return {*}  {Field}
     * @memberof DeepSparseMerkleSubTree
     */
    update(key, value) {
        const path = this.getKeyField(key);
        const valueField = this.getValueField(value);
        const treeHeight = this.getHeight();
        const pathBits = path.toBits(treeHeight);
        let sideNodes = [];
        let nodeHash = this.root;
        for (let i = 0; i < treeHeight; i++) {
            const currentValue = this.nodeStore.get(nodeHash.toString());
            if (currentValue === undefined) {
                throw new Error('Make sure you have added the correct proof, key and value using the addBranch method');
            }
            if (pathBits[i].toBoolean()) {
                sideNodes.push(currentValue[0]);
                nodeHash = currentValue[1];
            }
            else {
                sideNodes.push(currentValue[1]);
                nodeHash = currentValue[0];
            }
        }
        let currentHash = valueField;
        this.nodeStore.set(currentHash.toString(), [currentHash]);
        for (let i = this.getHeight() - 1; i >= 0; i--) {
            let sideNode = sideNodes[i];
            let currentValue = [];
            if (pathBits[i].toBoolean()) {
                currentValue = [sideNode, currentHash];
            }
            else {
                currentValue = [currentHash, sideNode];
            }
            currentHash = this.hasher(currentValue);
            this.nodeStore.set(currentHash.toString(), currentValue);
        }
        this.valueStore.set(path.toString(), valueField);
        this.root = currentHash;
        return this.root;
    }
}
function verifyProofWithUpdates(proof, expectedRoot, keyHashOrKeyField, valueHashOrValueField, hasher = PoseidonHasherFunc) {
    if (!proof.root.equals(expectedRoot).toBoolean()) {
        return { ok: false, updates: [] };
    }
    const { actualRoot, updates } = computeRoot(proof.sideNodes, keyHashOrKeyField, valueHashOrValueField, hasher);
    return { ok: actualRoot.equals(expectedRoot).toBoolean(), updates };
}
function computeRoot(sideNodes, keyHashOrKeyField, valueHashOrValueField, hasher = PoseidonHasherFunc) {
    let currentHash = valueHashOrValueField;
    const pathBits = keyHashOrKeyField.toBits(SMT_DEPTH);
    let updates = [];
    updates.push([currentHash, [currentHash]]);
    for (let i = SMT_DEPTH - 1; i >= 0; i--) {
        let node = sideNodes[i];
        let currentValue = [];
        if (pathBits[i].toBoolean()) {
            currentValue = [node, currentHash];
        }
        else {
            currentValue = [currentHash, node];
        }
        currentHash = hasher(currentValue);
        updates.push([currentHash, currentValue]);
    }
    return { actualRoot: currentHash, updates };
}
