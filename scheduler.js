import React, { useMemo, useState } from "react";

const COLOR = {
  TURNOVER: { bg: "#ff3bbd", fg: "#111" }, // PINK
  OPEN: { bg: "#ff2d2d", fg: "#fff" },     // RED
  ASSIGNED: { bg: "#16c784", fg: "#06140e" }, // GREEN
  CALLOUT: { bg: "#ff8a00", fg: "#1a1200" },  // ORANGE
  LOCKED: { bg: "#2f6bff", fg: "#fff" },      // BLUE
  MUTED: { bg: "#e8e8e8", fg: "#111" }
};

function statusColor(job) {
  const status = String(job.AssignmentStatus || "").toUpperCase();
  const locked = String(job.Locked || "").toUpperCase() === "Y";
  const notes = String(job.Notes || "").toUpperCase();
  const pri = String(job.Priority || "").toUpperCase();

  const isTurn = notes.includes("TURNOVER") || pri.includes("URGENT");
  const isCallout = notes.includes("CALLOUT");

  if (status === "OPEN") return "OPEN";
  if (isTurn) return "TURNOVER";
  if (isCallout) return "CALLOUT";
  if (locked) return "LOCKED";
  return "ASSIGNED";
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mockJobs(dateISO) {
  const props = Array.from({ length: 60 }).map((_, i) => `TP${i + 1}`);
  return props.map((p, i) => {
    const open = i % 7 === 0;
    const turnover = i % 11 === 0;
    const locked = i % 13 === 0;
    return {
      Date: dateISO,
      Shift: i % 2 === 0 ? "AM" : "PM",
      Property: p,
      AssignedCleaner: open ? "" : ["Maria", "Kevin", "Laura", "Sasha"][i % 4],
      Priority: turnover ? "URGENT" : "",
      JobID: `JOB_${i + 1}`,
      CleanerID: open ? "" : `C0${(i % 4) + 1}`,
      AssignmentStatus: open ? "OPEN" : "ASSIGNED",
      Locked: locked ? "Y" : "",
      LastUpdatedAt: "",
      Notes: turnover ? "TURNOVER" : ""
    };
  });
}

export default function SchedulerMock() {
  const [dateISO, setDateISO] = useState(isoToday());
  const [shiftFilter, setShiftFilter] = useState("ALL");
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");

  const jobs = useMemo(() => mockJobs(dateISO), [dateISO]);

  const filtered = useMemo(() => {
    const s = search.trim().toUpperCase();
    return jobs
      .filter(j => shiftFilter === "ALL" ? true : String(j.Shift).toUpperCase() === shiftFilter)
      .filter(j => openOnly ? String(j.AssignmentStatus).toUpperCase() === "OPEN" : true)
      .filter(j => s ? String(j.Property).toUpperCase().includes(s) : true)
      .sort((a, b) => {
        const aTurn = statusColor(a) === "TURNOVER";
        const bTurn = statusColor(b) === "TURNOVER";
        if (aTurn !== bTurn) return aTurn ? -1 : 1;
        const aOpen = statusColor(a) === "OPEN";
        const bOpen = statusColor(b) === "OPEN";
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return a.Property.localeCompare(b.Property);
      });
  }, [jobs, shiftFilter, openOnly, search]);

  const openCount = filtered.filter(j => statusColor(j) === "OPEN").length;
  const turnCount = filtered.filter(j => statusColor(j) === "TURNOVER").length;

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div style={styles.leftControls}>
          <div style={styles.label}>Date</div>
          <input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} style={styles.input} />
          <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)} style={styles.input}>
            <option value="ALL">ALL</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>

        <div style={styles.rightControls}>
          <input
            placeholder="Search TP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...styles.input, width: 180 }}
          />
          <label style={styles.check}>
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            Open only
          </label>

          <span style={{ ...styles.pill, background: COLOR.OPEN.bg, color: COLOR.OPEN.fg }}>OPEN: {openCount}</span>
          <span style={{ ...styles.pill, background: COLOR.TURNOVER.bg, color: COLOR.TURNOVER.fg }}>TURN: {turnCount}</span>
        </div>
      </div>

      <div style={styles.board}>
        <div style={styles.headerRow}>
          <div style={{ ...styles.th, width: 110 }}>Property</div>
          <div style={{ ...styles.th, width: 60 }}>Shift</div>
          <div style={{ ...styles.th, width: 210 }}>Tile</div>
          <div style={{ ...styles.th, flex: 1 }}>Notes</div>
          <div style={{ ...styles.th, width: 60, textAlign: "center" }}>Lock</div>
        </div>

        <div style={styles.body}>
          {filtered.map(job => {
            const state = statusColor(job);
            const c = COLOR[state] || COLOR.MUTED;
            const locked = String(job.Locked || "").toUpperCase() === "Y";

            return (
              <div key={job.JobID} style={styles.row}>
                <div style={{ ...styles.td, width: 110, fontWeight: 900 }}>{job.Property}</div>
                <div style={{ ...styles.td, width: 60 }}>{job.Shift}</div>

                <div style={{ ...styles.td, width: 210 }}>
                  <div style={{ ...styles.tile, background: c.bg, color: c.fg, border: state === "TURNOVER" ? "2px solid #111" : "1px solid rgba(0,0,0,0.25)" }}>
                    <div style={{ fontWeight: 900 }}>{job.AssignedCleaner || "OPEN"}</div>
                    <div style={{ fontSize: 11, opacity: 0.95 }}>{state}</div>
                  </div>
                </div>

                <div style={{ ...styles.td, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {job.Notes || ""}
                </div>

                <div style={{ ...styles.td, width: 60, justifyContent: "center" }}>
                  <span style={{ fontSize: 16 }}>{locked ? "🔒" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={styles.legend}>
        <Legend color={COLOR.TURNOVER.bg} text="TURNOVER = PINK" />
        <Legend color={COLOR.OPEN.bg} text="OPEN = RED" />
        <Legend color={COLOR.ASSIGNED.bg} text="ASSIGNED = GREEN" />
        <Legend color={COLOR.CALLOUT.bg} text="CALLOUT = ORANGE" />
        <Legend color={COLOR.LOCKED.bg} text="LOCKED = BLUE" />
      </div>
    </div>
  );
}

function Legend({ color, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 14, height: 14, background: color, borderRadius: 3, border: "1px solid rgba(0,0,0,0.2)" }} />
      <span style={{ fontSize: 12, fontWeight: 800 }}>{text}</span>
    </div>
  );
}

const styles = {
  page: { fontFamily: "system-ui", background: "#f6f6f8", minHeight: "100vh", padding: 12 },
  topBar: { display: "flex", justifyContent: "space-between", gap: 12, background: "#fff", padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" },
  leftControls: { display: "flex", alignItems: "center", gap: 10 },
  rightControls: { display: "flex", alignItems: "center", gap: 10 },
  label: { fontSize: 12, opacity: 0.75 },
  input: { padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)" },
  check: { display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.9 },
  pill: { padding: "6px 10px", borderRadius: 999, fontWeight: 900, fontSize: 12 },

  board: { marginTop: 12, background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden" },
  headerRow: { display: "flex", background: "#111", color: "#fff" },
  th: { padding: "8px 10px", fontSize: 12, fontWeight: 900 },

  body: { height: "calc(100vh - 190px)", overflowY: "auto" },
  row: { display: "flex", alignItems: "center", height: 28, borderBottom: "1px solid rgba(0,0,0,0.06)" },
  td: { padding: "0 10px", fontSize: 12, display: "flex", alignItems: "center" },

  tile: { height: 24, width: "100%", borderRadius: 8, padding: "2px 8px", display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.05 },

  legend: { marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", background: "#fff", padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }
};
