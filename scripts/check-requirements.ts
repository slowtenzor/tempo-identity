import * as fs from "fs";
import * as path from "path";

type AbiItem = {
  type: string;
  name?: string;
  inputs?: Array<{ name?: string; type?: string }>;
};

type CheckLevel = "must" | "future";

type ContractKey = "identity" | "reputation" | "nameService";

type RequirementCheck = {
  id: string;
  fr: string;
  level: CheckLevel;
  contract: ContractKey;
  kind: "function" | "event";
  name: string;
  inputTypes?: string[];
  inputNames?: string[];
  note?: string;
};

const ROOT = path.resolve(__dirname, "..");

const ARTIFACT_PATHS: Record<ContractKey, string> = {
  identity: path.join(
    ROOT,
    "artifacts/contracts/TempoIdentityRegistry.sol/TempoIdentityRegistry.json"
  ),
  reputation: path.join(
    ROOT,
    "artifacts/contracts/TempoReputationRegistry.sol/TempoReputationRegistry.json"
  ),
  nameService: path.join(
    ROOT,
    "artifacts/contracts/TempoNameService.sol/TempoNameService.json"
  ),
};

const checks: RequirementCheck[] = [
  // MUST-HAVE (already shipped in report)
  {
    id: "R-001",
    fr: "FR-001",
    level: "must",
    contract: "identity",
    kind: "function",
    name: "getAgentsByOwner",
    inputTypes: ["address"],
  },
  {
    id: "R-002",
    fr: "FR-006",
    level: "must",
    contract: "identity",
    kind: "function",
    name: "setAgentWallet",
    inputTypes: ["uint256", "address", "uint256", "bytes"],
    note: "EIP-712 secured wallet update path",
  },
  {
    id: "R-003",
    fr: "FR-006",
    level: "must",
    contract: "identity",
    kind: "event",
    name: "AgentWalletSet",
    inputTypes: ["uint256", "address", "address"],
    inputNames: ["agentId", "oldWallet", "newWallet"],
  },
  {
    id: "R-004",
    fr: "FR-007",
    level: "must",
    contract: "identity",
    kind: "function",
    name: "burn",
    inputTypes: ["uint256"],
  },
  {
    id: "R-005",
    fr: "FR-007",
    level: "must",
    contract: "identity",
    kind: "event",
    name: "AgentBurned",
    inputTypes: ["uint256", "address"],
  },
  {
    id: "R-006",
    fr: "FR-012",
    level: "must",
    contract: "identity",
    kind: "event",
    name: "URIUpdated",
    inputTypes: ["uint256", "string", "string", "address"],
    inputNames: ["agentId", "oldURI", "newURI", "updatedBy"],
  },
  {
    id: "R-007",
    fr: "FR-012",
    level: "must",
    contract: "identity",
    kind: "event",
    name: "MetadataSet",
    inputTypes: ["uint256", "string", "string", "bytes"],
    inputNames: ["agentId", "indexedMetadataKey", "metadataKey", "metadataValue"],
  },
  {
    id: "R-008",
    fr: "FR-004",
    level: "must",
    contract: "identity",
    kind: "function",
    name: "setAgentURI",
    inputTypes: ["uint256", "string"],
  },
  {
    id: "R-009",
    fr: "FR-004",
    level: "must",
    contract: "identity",
    kind: "function",
    name: "register",
    inputTypes: ["string", "tuple[]"],
    note: "Register with metadata overload",
  },
  {
    id: "R-010",
    fr: "FR-007",
    level: "must",
    contract: "nameService",
    kind: "function",
    name: "releaseName",
    inputTypes: ["string"],
    note: "Needed to release .tempo name before burn",
  },

  // FUTURE / DEFERRED
  {
    id: "R-011",
    fr: "FR-009",
    level: "future",
    contract: "reputation",
    kind: "function",
    name: "submitFeedback",
    note: "Receipt-gated feedback method",
  },
  {
    id: "R-012",
    fr: "FR-009",
    level: "future",
    contract: "reputation",
    kind: "event",
    name: "FeedbackSubmitted",
  },
  {
    id: "R-013",
    fr: "FR-010",
    level: "future",
    contract: "reputation",
    kind: "function",
    name: "tipAgent",
  },
  {
    id: "R-014",
    fr: "FR-010",
    level: "future",
    contract: "reputation",
    kind: "event",
    name: "AgentTipped",
  },
];

function loadAbi(contract: ContractKey): AbiItem[] {
  const p = ARTIFACT_PATHS[contract];
  if (!fs.existsSync(p)) {
    throw new Error(`Artifact not found: ${p}`);
  }
  const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as { abi?: AbiItem[] };
  if (!parsed.abi || !Array.isArray(parsed.abi)) {
    throw new Error(`Invalid artifact ABI: ${p}`);
  }
  return parsed.abi;
}

function normalizeInputs(item: AbiItem): { types: string[]; names: string[] } {
  const inputs = item.inputs || [];
  return {
    types: inputs.map((i) => String(i.type || "")),
    names: inputs.map((i) => String(i.name || "")),
  };
}

function matchesSignature(item: AbiItem, check: RequirementCheck): boolean {
  if (item.type !== check.kind) return false;
  if (item.name !== check.name) return false;

  if (!check.inputTypes && !check.inputNames) return true;

  const { types, names } = normalizeInputs(item);

  if (check.inputTypes) {
    if (types.length !== check.inputTypes.length) return false;
    for (let i = 0; i < check.inputTypes.length; i++) {
      if (types[i] !== check.inputTypes[i]) return false;
    }
  }

  if (check.inputNames) {
    if (names.length !== check.inputNames.length) return false;
    for (let i = 0; i < check.inputNames.length; i++) {
      if (names[i] !== check.inputNames[i]) return false;
    }
  }

  return true;
}

function findMatch(abi: AbiItem[], check: RequirementCheck): AbiItem | null {
  for (const item of abi) {
    if (matchesSignature(item, check)) return item;
  }
  return null;
}

function fmtContract(c: ContractKey): string {
  if (c === "identity") return "TempoIdentityRegistry";
  if (c === "reputation") return "TempoReputationRegistry";
  return "TempoNameService";
}

function run() {
  const strictAll = process.argv.includes("--strict-all");

  const abis: Record<ContractKey, AbiItem[]> = {
    identity: loadAbi("identity"),
    reputation: loadAbi("reputation"),
    nameService: loadAbi("nameService"),
  };

  const must = checks.filter((c) => c.level === "must");
  const future = checks.filter((c) => c.level === "future");

  let mustFail = 0;
  let futureMissing = 0;

  console.log("\n=== Tempo Contracts Requirement Audit ===");
  console.log(`Root: ${ROOT}`);
  console.log(`Mode: ${strictAll ? "strict-all" : "must-only"}`);

  console.log("\n-- Must-have now --");
  for (const check of must) {
    const match = findMatch(abis[check.contract], check);
    if (match) {
      console.log(`PASS ${check.id} [${check.fr}] ${fmtContract(check.contract)}.${check.name}`);
    } else {
      mustFail += 1;
      console.log(`FAIL ${check.id} [${check.fr}] ${fmtContract(check.contract)}.${check.name}`);
      if (check.note) console.log(`     note: ${check.note}`);
    }
  }

  console.log("\n-- Future/deferred (informational gaps) --");
  for (const check of future) {
    const match = findMatch(abis[check.contract], check);
    if (match) {
      console.log(`PASS ${check.id} [${check.fr}] ${fmtContract(check.contract)}.${check.name}`);
    } else {
      futureMissing += 1;
      console.log(`MISS ${check.id} [${check.fr}] ${fmtContract(check.contract)}.${check.name}`);
      if (check.note) console.log(`     note: ${check.note}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Must-have failed: ${mustFail}`);
  console.log(`Future missing:   ${futureMissing}`);

  if (mustFail > 0) {
    process.exit(1);
  }
  if (strictAll && futureMissing > 0) {
    process.exit(2);
  }
}

run();
