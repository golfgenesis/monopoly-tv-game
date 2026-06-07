import type { CardEffect, GroupId, OwnableTile, Tile } from "./types";

export interface GroupMeta {
  id: GroupId;
  name: string;
  color: string;
  houseCost: number;
}

export const GROUPS: Record<GroupId, GroupMeta> = {
  old: { id: "old", name: "ชุมชนเก่า", color: "#a16207", houseCost: 500 },
  china: { id: "china", name: "เยาวราช", color: "#38bdf8", houseCost: 500 },
  tour: { id: "tour", name: "ท่องเที่ยว", color: "#ec4899", houseCost: 1000 },
  biz: { id: "biz", name: "ย่านธุรกิจ", color: "#f97316", houseCost: 1000 },
  shop: { id: "shop", name: "ช้อปปิ้ง", color: "#ef4444", houseCost: 1500 },
  finance: { id: "finance", name: "ไลฟ์สไตล์", color: "#eab308", houseCost: 1500 },
  lux: { id: "lux", name: "ห้างหรู", color: "#22c55e", houseCost: 2000 },
  hiso: { id: "hiso", name: "ไฮโซ", color: "#2563eb", houseCost: 2000 },
  transport: { id: "transport", name: "ขนส่ง", color: "#475569", houseCost: 0 },
  utility: { id: "utility", name: "สาธารณูปโภค", color: "#0ea5e9", houseCost: 0 }
};

function prop(
  id: string,
  name: string,
  group: GroupId,
  price: number,
  baseRent: number,
  icon: string
): OwnableTile {
  return {
    id,
    name,
    kind: "property",
    group,
    accent: GROUPS[group].color,
    price,
    rent: [baseRent, baseRent * 5, baseRent * 15, baseRent * 45, baseRent * 70, baseRent * 95],
    houseCost: GROUPS[group].houseCost,
    mortgage: Math.round(price / 2),
    icon
  };
}

function transport(id: string, name: string, icon: string): OwnableTile {
  return {
    id,
    name,
    kind: "transport",
    group: "transport",
    accent: GROUPS.transport.color,
    price: 1000,
    // Rent by number of stations owned: 1→250, 2→500, 3→1000, 4→2000.
    rent: [250, 500, 1000, 2000, 0, 0],
    houseCost: 0,
    mortgage: 500,
    icon
  };
}

function utility(id: string, name: string, icon: string): OwnableTile {
  return {
    id,
    name,
    kind: "utility",
    group: "utility",
    accent: GROUPS.utility.color,
    price: 750,
    // Multiplier on dice sum: 1 owned → ×40, both → ×100.
    rent: [40, 100, 0, 0, 0, 0],
    houseCost: 0,
    mortgage: 375,
    icon
  };
}

export const BOARD: Tile[] = [
  { id: "go", name: "รับเงินเดือน", kind: "start", salary: 2000, accent: "#22c55e", icon: "💰" },
  prop("banglamphu", "บางลำพู", "old", 250, 20, "🏘️"),
  { id: "comm-1", name: "งานบุญ", kind: "community", accent: "#f59e0b", icon: "🎁" },
  prop("sampheng", "สำเพ็ง", "old", 300, 40, "🧧"),
  { id: "tax-land", name: "ภาษีที่ดิน", kind: "tax", amount: 1000, accent: "#dc2626", icon: "📜" },
  transport("hualamphong", "สถานีหัวลำโพง", "🚉"),
  prop("yaowarat", "เยาวราช", "china", 350, 60, "🏮"),
  { id: "chance-1", name: "ดวง", kind: "chance", accent: "#8b5cf6", icon: "❓" },
  prop("talingnam", "ตลาดน้ำ", "china", 350, 60, "🛶"),
  prop("khaosan", "ถนนข้าวสาร", "china", 400, 80, "🎒"),
  { id: "jail", name: "เยี่ยมคุก", kind: "jail", accent: "#f97316", icon: "🚧" },
  prop("muaythai", "สนามมวย", "tour", 450, 100, "🥊"),
  utility("power", "การไฟฟ้า", "⚡"),
  prop("lumpini", "สวนลุมพินี", "tour", 450, 100, "🌳"),
  prop("siamsquare", "สยามสแควร์", "tour", 500, 120, "🛍️"),
  transport("bangkokport", "ท่าเรือกรุงเทพ", "⚓"),
  prop("bangrak", "ย่านบางรัก", "biz", 550, 140, "🏢"),
  { id: "comm-2", name: "งานบุญ", kind: "community", accent: "#f59e0b", icon: "🎁" },
  prop("ladprao", "ลาดพร้าว", "biz", 550, 140, "🏬"),
  prop("phaholyothin", "พหลโยธิน", "biz", 600, 160, "🛣️"),
  { id: "parking", name: "จอดฟรี", kind: "parking", accent: "#0ea5e9", icon: "🅿️" },
  prop("silom", "สีลม", "shop", 650, 180, "🏦"),
  { id: "chance-2", name: "ดวง", kind: "chance", accent: "#8b5cf6", icon: "❓" },
  prop("sukhumvit", "สุขุมวิท", "shop", 650, 180, "🌆"),
  prop("iconsiam", "ไอคอนสยาม", "shop", 700, 200, "🏙️"),
  transport("btsstation", "รถไฟฟ้า BTS", "🚝"),
  prop("thonglor", "ทองหล่อ", "finance", 750, 220, "🍸"),
  prop("ekkamai", "เอกมัย", "finance", 750, 220, "🎶"),
  utility("water", "การประปา", "💧"),
  prop("phrompong", "พร้อมพงษ์", "finance", 800, 240, "🏨"),
  { id: "gotojail", name: "ไปคุก!", kind: "gotojail", accent: "#b91c1c", icon: "👮" },
  prop("gaysorn", "เกษรวิลเลจ", "lux", 850, 260, "💎"),
  prop("centralworld", "เซ็นทรัลเวิลด์", "lux", 850, 260, "🛒"),
  { id: "comm-3", name: "งานบุญ", kind: "community", accent: "#f59e0b", icon: "🎁" },
  prop("paragon", "สยามพารากอน", "lux", 900, 280, "🏛️"),
  transport("laemchabang", "ท่าเรือแหลมฉบัง", "🚢"),
  { id: "chance-3", name: "ดวง", kind: "chance", accent: "#8b5cf6", icon: "❓" },
  prop("asoke", "อโศกมนตรี", "hiso", 1000, 350, "🌃"),
  { id: "tax-hospital", name: "รพ.เอกชน", kind: "tax", amount: 800, accent: "#dc2626", icon: "🏥" },
  prop("sathorn", "สาทร", "hiso", 1200, 500, "🏆")
];

export const GO_INDEX = 0;
export const JAIL_INDEX = BOARD.findIndex((tile) => tile.kind === "jail");
export const GOTOJAIL_INDEX = BOARD.findIndex((tile) => tile.kind === "gotojail");

export const CHANCE_DECK: CardEffect[] = [
  { id: "c-lotto", text: "ถูกหวยรัฐบาล รับ ฿1,000", tone: "good", kind: "gain", amount: 1000 },
  { id: "c-carfix", text: "ค่าซ่อมรถ จ่าย ฿500", tone: "bad", kind: "pay", amount: 500 },
  { id: "c-home", text: "กลับบ้าน เลื่อนไปช่องรับเงินเดือน", tone: "good", kind: "moveTo", target: GO_INDEX, awardSalary: true },
  { id: "c-icon", text: "ไปช้อปไอคอนสยาม! เลื่อนไปช่องไอคอนสยาม", tone: "info", kind: "moveTo", target: 24, awardSalary: true },
  { id: "c-arrest", text: "โดนจับกุม! ไปติดคุกทันที", tone: "bad", kind: "gotoJail" },
  { id: "c-bail", text: "ได้บัตรพ้นโทษ เก็บไว้ใช้ออกจากคุก", tone: "good", kind: "jailCard" },
  { id: "c-dividend", text: "เงินปันผลหุ้น รับ ฿700", tone: "good", kind: "gain", amount: 700 },
  { id: "c-incometax", text: "จ่ายภาษีรายได้ ฿800", tone: "bad", kind: "pay", amount: 800 },
  { id: "c-birthday", text: "วันเกิด! รับจากเพื่อนทุกคน คนละ ฿200", tone: "good", kind: "collectEach", amount: 200 },
  { id: "c-train", text: "นั่งรถไฟ เลื่อนไปสถานีหัวลำโพง", tone: "info", kind: "moveTo", target: 5, awardSalary: true }
];

export const COMMUNITY_DECK: CardEffect[] = [
  { id: "m-inherit", text: "ได้รับมรดก รับ ฿1,500", tone: "good", kind: "gain", amount: 1500 },
  { id: "m-prize", text: "ถูกรางวัลที่ 1 รับ ฿1,000", tone: "good", kind: "gain", amount: 1000 },
  { id: "m-doctor", text: "ค่ารักษาพยาบาล จ่าย ฿600", tone: "bad", kind: "pay", amount: 600 },
  { id: "m-ticket", text: "ใบสั่งจราจร จ่าย ฿400", tone: "bad", kind: "pay", amount: 400 },
  { id: "m-bail", text: "ได้บัตรพ้นโทษ เก็บไว้ใช้ออกจากคุก", tone: "good", kind: "jailCard" },
  { id: "m-treat", text: "เลี้ยงข้าวเพื่อน จ่ายทุกคน คนละ ฿150", tone: "bad", kind: "payEach", amount: 150 },
  { id: "m-taxback", text: "เงินคืนภาษี รับ ฿500", tone: "good", kind: "gain", amount: 500 },
  { id: "m-return", text: "กลับจุดเริ่ม รับเงินเดือน", tone: "good", kind: "moveTo", target: GO_INDEX, awardSalary: true },
  { id: "m-temple", text: "ทำบุญงานวัด จ่าย ฿700", tone: "bad", kind: "pay", amount: 700 },
  { id: "m-profit", text: "ขายของได้กำไร รับ ฿300", tone: "good", kind: "gain", amount: 300 }
];

export function getTile(tileId: string): Tile {
  const tile = BOARD.find((candidate) => candidate.id === tileId);
  if (!tile) {
    throw new Error(`Unknown tile: ${tileId}`);
  }
  return tile;
}

export function isOwnable(tile: Tile): tile is OwnableTile {
  return tile.kind === "property" || tile.kind === "transport" || tile.kind === "utility";
}
