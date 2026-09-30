const computeNeutralTieBreaker = (
  proxyId,
  dateStr,
  startTimeJoint,
  endTimeJoint
) => {
  const key = `${dateStr}|${startTimeJoint}|${endTimeJoint}|${String(proxyId)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

const proxyA = "Dishant_ID";
const proxyB = "Other_User_ID";

console.log("Testing tie-breaker for different times on 2026-10-01:");
const times = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];

times.forEach(t => {
  const hashA = computeNeutralTieBreaker(proxyA, "2026-10-01", t, "15:00");
  const hashB = computeNeutralTieBreaker(proxyB, "2026-10-01", t, "15:00");
  const winner = hashA < hashB ? "Dishant" : "Other User";
  console.log(`Time ${t} -> Winner: ${winner}`);
});
