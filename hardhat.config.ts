import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: {
            evmVersion: "cancun",
            viaIR: true,
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        tempoModerato: {
            url: "https://rpc.moderato.tempo.xyz",
            chainId: 42431,
            accounts: [DEPLOYER_PRIVATE_KEY],
        },
    },
};

export default config;
