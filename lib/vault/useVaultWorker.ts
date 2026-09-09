"use client";

import { useEffect, useRef, useCallback } from "react";
import { ReportPayload } from "@/lib/reports/reportTypes";
import { MatrixParseResult, TrackedPhysicalIndication } from "@/lib/import/matrixParser";

interface WorkerTask<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export function useVaultWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingTasks = useRef<Map<string, WorkerTask<any>>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const worker = new Worker("/workers/matrixProcessorWorker.js");

      worker.onmessage = (e) => {
        const { id, success, result, error } = e.data;
        const task = pendingTasks.current.get(id);
        if (task) {
          pendingTasks.current.delete(id);
          if (success) {
            task.resolve(result);
          } else {
            task.reject(new Error(error || "Worker processing error"));
          }
        }
      };

      worker.onerror = (err) => {
        console.error("Worker fatal error:", err);
      };

      workerRef.current = worker;
    } catch (err) {
      console.warn("Failed to instantiate WebWorker:", err);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const runTask = useCallback(<T>(action: string, payload: any): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        // Fallback: If WebWorker is blocked or unavailable, reject gracefully
        return reject(new Error("WebWorker not available in current environment."));
      }

      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      pendingTasks.current.set(id, { resolve, reject });

      workerRef.current.postMessage({ id, action, payload });
    });
  }, []);

  const compileReportPayloadWithWorker = useCallback(
    (params: {
      matrix: MatrixParseResult;
      targetDrumName?: string;
      targetWeldName?: string;
      customNominalThickness?: number;
      customDiameter?: number;
    }): Promise<ReportPayload> => {
      return runTask<ReportPayload>("COMPILE_REPORT_PAYLOAD", params);
    },
    [runTask]
  );

  const filterIndicationsWithWorker = useCallback(
    (params: {
      matrixResult: MatrixParseResult;
      selectedTanks?: string[];
      selectedWelds?: string[];
    }): Promise<TrackedPhysicalIndication[]> => {
      return runTask<TrackedPhysicalIndication[]>("FILTER_INDICATIONS", params);
    },
    [runTask]
  );

  return {
    compileReportPayloadWithWorker,
    filterIndicationsWithWorker,
  };
}