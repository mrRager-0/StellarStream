"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import type { Stream } from "@/lib/contracts/stellarstream";
import { useFlowRate } from "@/lib/use-flow-rate";

const DIGIT_HEIGHT = 56;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type Token =
  | { type: "digit"; value: number }
  | { type: "static"; value: string };

function DigitRoller({ digit }: { digit: number }) {
  const spring = useSpring(digit, { stiffness: 180, damping: 22, mass: 0.6 });

  useEffect(() => {
    spring.set(digit);
  }, [digit, spring]);

  const y = useTransform(spring, (v) => -v * DIGIT_HEIGHT);

  return (
    <div
      style={{
        position: "relative",
        height: `${DIGIT_HEIGHT}px`,
        width: "0.62em",
        overflow: "hidden",
        display: "inline-block",
      }}
    >
      <motion.div style={{ y, willChange: "transform" }}>
        {DIGITS.map((d) => (
          <div
            key={d}
            style={{
              height: `${DIGIT_HEIGHT}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {d}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function StaticChar({ char }: { char: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: `${DIGIT_HEIGHT}px`,
        paddingBottom: "2px",
      }}
    >
      {char}
    </span>
  );
}

function Odometer({
  value,
  prefix = "$",
  decimals = 7,
  color = "#00f5ff",
}: {
  value: number;
  prefix?: string;
  decimals?: number;
  color?: string;
}) {
  const tokens = useMemo<Token[]>(() => {
    const num = isNaN(value) ? 0 : value;
    const [intPart, decPart = ""] = num.toFixed(decimals).split(".");
    const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const result: Token[] = [];
    for (const ch of prefix) result.push({ type: "static", value: ch });
    for (const ch of intWithCommas) {
      result.push(
        /\d/.test(ch)
          ? { type: "digit", value: parseInt(ch, 10) }
          : { type: "static", value: ch },
      );
    }
    result.push({ type: "static", value: "." });
    for (const ch of decPart)
      result.push({ type: "digit", value: parseInt(ch, 10) });
    return result;
  }, [value, prefix, decimals]);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: `${DIGIT_HEIGHT}px`,
        fontWeight: 700,
        color,
        textShadow: `0 0 8px ${color}cc, 0 0 24px ${color}66, 0 0 56px ${color}33`,
        letterSpacing: "-0.02em",
        userSelect: "none",
      }}
    >
      {tokens.map((t, i) =>
        t.type === "digit" ? (
          <DigitRoller key={i} digit={t.value} />
        ) : (
          <StaticChar key={i} char={t.value} />
        ),
      )}
    </div>
  );
}

const CORNERS: Array<["top" | "bottom", "left" | "right"]> = [
  ["top", "left"],
  ["top", "right"],
  ["bottom", "left"],
  ["bottom", "right"],
];

export interface StreamingBalanceCardProps {
  initialValue?: number;
  rate?: number;
  prefix?: string;
  decimals?: number;
  color?: string;
  /** Pass a live contract Stream to derive balance and rate automatically */
  stream?: Stream | null;
}

export default function StreamingBalanceCard({
  initialValue = 48291.3847291,
  rate = 0.0000247,
  prefix = "$",
  decimals = 7,
  color = "#00f5ff",
  stream,
}: StreamingBalanceCardProps) {
  // If a contract stream is provided, derive rate and initial balance from it
  const flowRate = useFlowRate(stream);
  const resolvedInitial = stream ? flowRate.balance : initialValue;
  const resolvedRate = stream ? flowRate.ratePerMs : rate;

  const [balance, setBalance] = useState(resolvedInitial);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number | null>(null);

  // Sync balance when stream data changes (e.g. new block)
  useEffect(() => {
    if (stream) setBalance(flowRate.balance);
  }, [stream, flowRate.balance]);

  useEffect(() => {
    lastRef.current = null;
    const tick = (ts: number) => {
      if (lastRef.current !== null) {
        const delta = ts - lastRef.current;
        setBalance((b) => b + resolvedRate * delta);
      }
      lastRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [resolvedRate]);

  return (
    <div
      style={{
        padding: "32px 48px",
        border: `1px solid ${color}33`,
        borderRadius: "16px",
        background: "#030303",
        boxShadow: `0 0 0 1px ${color}11, 0 8px 32px rgba(0,0,0,0.5), 0 0 60px ${color}12, inset 0 1px 0 ${color}18, inset 0 0 40px ${color}07`,
        position: "relative",
        display: "inline-flex",
      }}
    >
      {CORNERS.map(([v, h]) => (
        <div
          key={`${v}-${h}`}
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            [v]: -1,
            [h]: -1,
            borderTop: v === "top" ? `1px solid ${color}80` : "none",
            borderBottom: v === "bottom" ? `1px solid ${color}80` : "none",
            borderLeft: h === "left" ? `1px solid ${color}80` : "none",
            borderRight: h === "right" ? `1px solid ${color}80` : "none",
          }}
        />
      ))}
      <Odometer
        value={balance}
        prefix={prefix}
        decimals={decimals}
        color={color}
      />
    </div>
  );
}
