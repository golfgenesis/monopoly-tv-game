import type { Tile } from "./types";

export const BOARD: Tile[] = [
  { id: "start", name: "รับเงินเดือน", kind: "start", salary: 2000, accent: "#facc15" },
  { id: "market-1", name: "ตลาดเช้า", kind: "property", district: "ตลาด", price: 600, rent: 80, accent: "#22c55e" },
  { id: "chance-1", name: "บัตรดวง", kind: "chance", accent: "#38bdf8" },
  { id: "market-2", name: "ตลาดนัด", kind: "property", district: "ตลาด", price: 700, rent: 90, accent: "#22c55e" },
  { id: "tax-1", name: "ค่าปรับ", kind: "tax", amount: 200, accent: "#ef4444" },
  { id: "rail-1", name: "สถานีรถไฟ", kind: "transport", district: "เดินทาง", price: 1200, rent: 180, accent: "#6366f1" },
  { id: "canal-1", name: "ท่าน้ำ", kind: "property", district: "คลอง", price: 900, rent: 120, accent: "#06b6d4" },
  { id: "chance-2", name: "บัตรวาสนา", kind: "chance", accent: "#fb7185" },
  { id: "canal-2", name: "บ้านริมน้ำ", kind: "property", district: "คลอง", price: 1000, rent: 140, accent: "#06b6d4" },
  { id: "rest", name: "พักตากอากาศ", kind: "rest", accent: "#a78bfa" },
  { id: "oldtown-1", name: "ตรอกเก่า", kind: "property", district: "เมืองเก่า", price: 1300, rent: 180, accent: "#f97316" },
  { id: "utility-1", name: "การประปา", kind: "utility", district: "สาธารณูปโภค", price: 1000, rent: 150, accent: "#0ea5e9" },
  { id: "oldtown-2", name: "ย่านเมืองเก่า", kind: "property", district: "เมืองเก่า", price: 1500, rent: 220, accent: "#f97316" },
  { id: "tax-2", name: "ภาษีที่ดิน", kind: "tax", amount: 350, accent: "#dc2626" },
  { id: "rail-2", name: "ท่าเรือ", kind: "transport", district: "เดินทาง", price: 1200, rent: 180, accent: "#6366f1" },
  { id: "beach-1", name: "หาดทราย", kind: "property", district: "ทะเล", price: 1800, rent: 260, accent: "#14b8a6" },
  { id: "chance-3", name: "บัตรดวง", kind: "chance", accent: "#38bdf8" },
  { id: "beach-2", name: "รีสอร์ต", kind: "property", district: "ทะเล", price: 2100, rent: 320, accent: "#14b8a6" },
  { id: "utility-2", name: "การไฟฟ้า", kind: "utility", district: "สาธารณูปโภค", price: 1000, rent: 150, accent: "#eab308" },
  { id: "metro-1", name: "ตึกแถว", kind: "property", district: "มหานคร", price: 2400, rent: 380, accent: "#ec4899" },
  { id: "chance-4", name: "บัตรวาสนา", kind: "chance", accent: "#fb7185" },
  { id: "metro-2", name: "ห้างใหญ่", kind: "property", district: "มหานคร", price: 2800, rent: 450, accent: "#ec4899" },
  { id: "tax-3", name: "ซ่อมบ้าน", kind: "tax", amount: 500, accent: "#b91c1c" },
  { id: "metro-3", name: "สยามทาวเวอร์", kind: "property", district: "มหานคร", price: 3200, rent: 560, accent: "#ec4899" }
];

export function getTile(tileId: string): Tile {
  const tile = BOARD.find((candidate) => candidate.id === tileId);
  if (!tile) {
    throw new Error(`Unknown tile: ${tileId}`);
  }
  return tile;
}
