// Create ethers provider & signer (server-side)
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import oumgAbi from "../../abi/oumg.json";
import infoAbi from "../../abi/oumgInfo.json";
import priceAbi from "../../abi/oumgPrice.json";

const RPC_URL = process.env.RPC_URL!;
const OUMG_ADDRESS = process.env.OUMG_ADDRESS!;
const OUMG_INFO_ADDRESS = process.env.OUMG_INFO_ADDRESS!;
const OUMG_PRICE_ADDRESS = process.env.OUMG_PRICE_ADDRESS!;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;

if (!RPC_URL || !OUMG_ADDRESS || !OUMG_INFO_ADDRESS || !OUMG_PRICE_ADDRESS || !ADMIN_PRIVATE_KEY) {
  throw new Error("Missing env for chain connection");
}

export const provider = new JsonRpcProvider(RPC_URL);
export const signer = new Wallet(ADMIN_PRIVATE_KEY, provider);

export const Oumg = new Contract(OUMG_ADDRESS, oumgAbi, signer);
export const Info = new Contract(OUMG_INFO_ADDRESS, infoAbi, signer);
export const Price = new Contract(OUMG_PRICE_ADDRESS, priceAbi, signer);