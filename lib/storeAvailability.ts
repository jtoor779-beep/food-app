type StoreAvailabilityRow = {
  approval_status?: string | null
  is_disabled?: boolean | null
  accepting_orders?: boolean | null
  opens_at_time?: string | null
  closes_at_time?: string | null
  timezone?: string | null
  manual_next_open_at?: string | null
}

function clean(value: unknown) {
  return String(value || "").trim()
}

function parseMinutes(value: unknown) {
  const raw = clean(value)
  const match = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function formatClock(value: unknown) {
  const mins = parseMinutes(value)
  if (mins == null) return ""
  const hours24 = Math.floor(mins / 60)
  const minutes = mins % 60
  const suffix = hours24 >= 12 ? "PM" : "AM"
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`
}

function safeDate(value: unknown) {
  const raw = clean(value)
  if (!raw) return null
  const next = new Date(raw)
  return Number.isFinite(next.getTime()) ? next : null
}

function getNowParts(now: Date, timeZone?: string | null) {
  const zone = clean(timeZone)
  if (zone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      const parts = formatter.formatToParts(now)
      const weekday = parts.find((part) => part.type === "weekday")?.value || ""
      const hour = Number(parts.find((part) => part.type === "hour")?.value || "0")
      const minute = Number(parts.find((part) => part.type === "minute")?.value || "0")
      return {
        weekday,
        minutes: hour * 60 + minute,
      }
    } catch {}
  }

  return {
    weekday: now.toLocaleDateString("en-US", { weekday: "short" }),
    minutes: now.getHours() * 60 + now.getMinutes(),
  }
}

function isVisible(row: StoreAvailabilityRow | null | undefined) {
  if (!row) return false
  const approval = clean(row.approval_status || "approved").toLowerCase()
  if (approval && approval !== "approved") return false
  if (row.is_disabled) return false
  return true
}

function formatNextOpen(date: Date, timeZone?: string | null) {
  const zone = clean(timeZone)
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone || undefined,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function computeScheduleMessage(
  opensAtTime: string | null | undefined,
  closesAtTime: string | null | undefined,
  nowMinutes: number
) {
  const opens = parseMinutes(opensAtTime)
  const closes = parseMinutes(closesAtTime)

  if (opens == null || closes == null || opens === closes) {
    return {
      withinHours: true,
      nextOpenText: "",
      scheduleText: "",
    }
  }

  const opensLabel = formatClock(opensAtTime)
  const closesLabel = formatClock(closesAtTime)
  const overnight = opens > closes
  let withinHours = false
  let nextOpenText = ""

  if (!overnight) {
    withinHours = nowMinutes >= opens && nowMinutes < closes
    nextOpenText = nowMinutes < opens ? `Opens today at ${opensLabel}` : `Opens tomorrow at ${opensLabel}`
  } else {
    withinHours = nowMinutes >= opens || nowMinutes < closes
    nextOpenText = nowMinutes < opens ? `Opens today at ${opensLabel}` : `Opens tonight at ${opensLabel}`
  }

  return {
    withinHours,
    nextOpenText,
    scheduleText: `${opensLabel} - ${closesLabel}`,
  }
}

export function getStoreAvailability(row: StoreAvailabilityRow | null | undefined, now = new Date()) {
  const visible = isVisible(row)
  const timeZone = clean(row?.timezone)
  const nowParts = getNowParts(now, timeZone)
  const schedule = computeScheduleMessage(row?.opens_at_time, row?.closes_at_time, nowParts.minutes)
  const manualNextOpenAt = safeDate(row?.manual_next_open_at)
  const hasFutureManualOpen = !!manualNextOpenAt && manualNextOpenAt.getTime() > now.getTime()
  const manualClosureExpired = !!manualNextOpenAt && manualNextOpenAt.getTime() <= now.getTime()
  const manuallyClosed = row?.accepting_orders === false && !manualClosureExpired

  let isOpen = visible && schedule.withinHours && !manuallyClosed
  if (visible && !schedule.withinHours) isOpen = false
  if (!visible) isOpen = false

  const statusLabel = isOpen ? "Open" : "Closed"
  let nextOpenText = ""
  let customerMessage = ""

  if (!visible) {
    customerMessage = "This store is not accepting orders right now."
  } else if (hasFutureManualOpen && manualNextOpenAt) {
    nextOpenText = `Opens ${formatNextOpen(manualNextOpenAt, timeZone)}`
    customerMessage = nextOpenText
  } else if (!schedule.withinHours && schedule.nextOpenText) {
    nextOpenText = schedule.nextOpenText
    customerMessage = schedule.nextOpenText
  } else if (row?.accepting_orders === false) {
    customerMessage = "Store is temporarily closed."
  } else if (isOpen && schedule.scheduleText) {
    customerMessage = `Open now until ${formatClock(row?.closes_at_time)}`
  } else if (isOpen) {
    customerMessage = "Open now"
  }

  return {
    isVisible: visible,
    isOpen,
    statusLabel,
    nextOpenText,
    customerMessage,
    scheduleText: schedule.scheduleText,
    opensAtLabel: formatClock(row?.opens_at_time),
    closesAtLabel: formatClock(row?.closes_at_time),
    canAddToCart: isOpen,
    canCheckout: isOpen,
    timeZone,
  }
}
