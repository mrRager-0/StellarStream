"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignatureStatus = "pending" | "signed" | "rejected";

export interface Signer {
    address: string;
    status: SignatureStatus;
    signedAt?: Date;
}

export interface PendingStream {
    id: string;
    streamId: string;
    recipient: string;
    sender: string;
    amount: number;
    token: string;
    ratePerSecond: number;
    duration: number; // in days
    createdAt: Date;
    expiresAt: Date;
    requiredSignatures: number;
    signers: Signer[];
    hasCurrentUserSigned: boolean;
    currentUserAddress: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CURRENT_USER = "GDZX...4KLM";

const INITIAL_PENDING_STREAMS: PendingStream[] = [
    {
        id: "pending-1",
        streamId: "0xa3f1…c290",
        recipient: "GBTY...8NOP",
        sender: "GABC...7XYZ",
        amount: 50000,
        token: "USDC",
        ratePerSecond: 0.02893,
        duration: 20,
        createdAt: new Date(Date.now() - 1000 * 60 * 30),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 47),
        requiredSignatures: 3,
        signers: [
            { address: "GABC...7XYZ", status: "signed", signedAt: new Date(Date.now() - 1000 * 60 * 28) },
            { address: MOCK_CURRENT_USER, status: "pending" },
            { address: "GCQR...2STU", status: "pending" },
        ],
        hasCurrentUserSigned: false,
        currentUserAddress: MOCK_CURRENT_USER,
    },
    {
        id: "pending-2",
        streamId: "0xb7d4…e451",
        recipient: "GCQR...2STU",
        sender: "GDEF...3QRS",
        amount: 12500,
        token: "XLM",
        ratePerSecond: 0.00723,
        duration: 60,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 22),
        requiredSignatures: 2,
        signers: [
            { address: MOCK_CURRENT_USER, status: "pending" },
            { address: "GDEF...3QRS", status: "signed", signedAt: new Date(Date.now() - 1000 * 60 * 90) },
        ],
        hasCurrentUserSigned: false,
        currentUserAddress: MOCK_CURRENT_USER,
    },
    {
        id: "pending-3",
        streamId: "0xc9e2…f782",
        recipient: "GDZX...4KLM",
        sender: "GBTY...8NOP",
        amount: 8000,
        token: "USDC",
        ratePerSecond: 0.00463,
        duration: 14,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 19),
        requiredSignatures: 4,
        signers: [
            { address: "GABC...7XYZ", status: "signed", signedAt: new Date(Date.now() - 1000 * 60 * 60 * 4) },
            { address: "GBTY...8NOP", status: "signed", signedAt: new Date(Date.now() - 1000 * 60 * 60 * 3) },
            { address: MOCK_CURRENT_USER, status: "signed", signedAt: new Date(Date.now() - 1000 * 60 * 60 * 1) },
            { address: "GCQR...2STU", status: "pending" },
        ],
        hasCurrentUserSigned: true,
        currentUserAddress: MOCK_CURRENT_USER,
    },
];

// ─── Soroban contract simulation ─────────────────────────────────────────────

/**
 * Simulates calling the Soroban `approve_stream_request` contract function.
 * Replace this with the real Soroban SDK call when integrating with the chain.
 *
 * @example Real integration would look like:
 * ```ts
 * import { Contract, SorobanRpc } from "@stellar/stellar-sdk";
 * const server = new SorobanRpc.Server(RPC_URL);
 * const contract = new Contract(CONTRACT_ADDRESS);
 * const tx = await contract.call("approve_stream_request", streamId);
 * const result = await server.sendTransaction(tx);
 * ```
 */
async function callApproveStreamRequest(streamId: string): Promise<{ txHash: string }> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 1800 + Math.random() * 800));

    // Simulate 10% failure rate for realistic UX testing
    if (Math.random() < 0.1) {
        throw new Error("Transaction simulation failed: insufficient signers or network error");
    }

    const mockTxHash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join("")}`;

    return { txHash: mockTxHash };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePendingStreams(pollIntervalMs = 15_000) {
    const [streams, setStreams] = useState<PendingStream[]>(INITIAL_PENDING_STREAMS);
    const [signingIds, setSigningIds] = useState<Set<string>>(new Set());
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

    // Simulate poll for updates
    useEffect(() => {
        const id = setInterval(() => {
            setLastRefreshed(new Date());
            // In production, fetch from RPC / indexer here
        }, pollIntervalMs);
        return () => clearInterval(id);
    }, [pollIntervalMs]);

    const signStream = useCallback(
        async (pendingId: string): Promise<{ txHash: string }> => {
            setSigningIds((prev) => new Set(prev).add(pendingId));

            try {
                const stream = streams.find((s) => s.id === pendingId);
                if (!stream) throw new Error("Stream not found");

                const { txHash } = await callApproveStreamRequest(stream.streamId);

                setStreams((prev) =>
                    prev
                        .map((s) => {
                            if (s.id !== pendingId) return s;

                            const updatedSigners = s.signers.map((signer) =>
                                signer.address === s.currentUserAddress
                                    ? { ...signer, status: "signed" as SignatureStatus, signedAt: new Date() }
                                    : signer
                            );

                            const signedCount = updatedSigners.filter((sg) => sg.status === "signed").length;
                            const allSigned = signedCount >= s.requiredSignatures;

                            // Remove from queue if fully signed
                            if (allSigned) return null as unknown as PendingStream;

                            return {
                                ...s,
                                signers: updatedSigners,
                                hasCurrentUserSigned: true,
                            };
                        })
                        .filter(Boolean)
                );

                return { txHash };
            } finally {
                setSigningIds((prev) => {
                    const next = new Set(prev);
                    next.delete(pendingId);
                    return next;
                });
            }
        },
        [streams]
    );

    const signedCount = (stream: PendingStream) =>
        stream.signers.filter((s) => s.status === "signed").length;

    return {
        streams,
        signingIds,
        lastRefreshed,
        signStream,
        signedCount,
        currentUserAddress: MOCK_CURRENT_USER,
    };
}