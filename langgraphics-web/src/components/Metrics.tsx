import {useMemo} from "react";
import {Popover, Progress} from "antd";
import type {ColorMode} from "@xyflow/react";
import type {NodeMetrics} from "../types";

export function Metrics({colorMode, metrics}: { colorMode: ColorMode, metrics: NodeMetrics }) {
    const theme = useMemo(() => {
        if (colorMode !== "system") return colorMode;
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }, [colorMode]);

    const color = useMemo(() => {
        return theme === "dark" ? "#c8c8c8" : "#141414";
    }, [theme]);

    const background = useMemo(() => {
        return theme === "dark" ? "#141414" : "#c8c8c8";
    }, [theme]);

    const border = useMemo(() => {
        return theme === "dark" ? "1px solid #3c3c3c80" : "1px solid #c8c8c880";
    }, [theme]);

    return (
        <div className="inspect-metrics">
            <span className="inspect-metric">
                <svg viewBox="85.333333 85.333333 853.333334 853.333334" version="1.1" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                    <path d="M512 85.333333a426.666667 426.666667 0 1 0 426.666667 426.666667A426.666667 426.666667 0 0 0 512 85.333333z m0 768a341.333333 341.333333 0 1 1 341.333333-341.333333 341.333333 341.333333 0 0 1-341.333333 341.333333z m37.546667-356.693333V277.333333a21.333333 21.333333 0 0 0-21.333334-21.333333h-32.426666a21.333333 21.333333 0 0 0-21.333334 21.333333v241.493334a22.613333 22.613333 0 0 0 6.4 14.933333l170.666667 170.666667a21.76 21.76 0 0 0 30.293333 0l22.613334-22.613334a21.76 21.76 0 0 0 0-30.293333z" fill="#3b82f6"/>
                </svg>
                <span style={{fontWeight: "bold"}}>LATENCY</span>
                <span>{metrics.latency}</span>
            </span>
            <Popover
                arrow={false}
                placement="bottom"
                open={metrics.tokens.total !== 0 ? undefined : false}
                content={(
                    <>
                        <div style={{
                            display: "flex",
                            whiteSpace: "nowrap",
                            justifyContent: "space-between",
                        }}>
                            <span>Total</span>
                            <span>{metrics.tokens.total}</span>
                        </div>
                        <div style={{
                            display: "flex",
                            whiteSpace: "nowrap",
                            justifyContent: "space-between",
                        }}>
                            <span>Cached</span>
                            <span>{metrics.tokens.cached}</span>
                        </div>
                        <Progress
                            percent={100}
                            showInfo={false}
                            strokeLinecap="square"
                            strokeColor={["#d67506"]}
                            styles={{root: {borderRadius: 8, overflow: "hidden"}}}
                            success={{percent: (metrics.tokens.cached / metrics.tokens.total) * 100, strokeColor: color}}
                        />
                    </>
                )}
                classNames={{container: "inspect-metric-popover"}}
                styles={{content: {color}, container: {background, border}}}
            >
                <span className="inspect-metric" style={{cursor: metrics.tokens.total !== 0 ? "pointer" : "auto"}}>
                    <svg viewBox="85.333333 85.333333 853.333334 853.333334" version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                        <path d="M512 918.9376a389.12 389.12 0 1 1 0-778.24 389.12 389.12 0 0 1 0 778.24z m0-77.824a311.296 311.296 0 1 0 0-622.592 311.296 311.296 0 0 0 0 622.592z m0-503.93088l192.59392 192.63488L512 722.41152l-192.59392-192.59392L512 337.18272z m0 110.05952l-82.5344 82.57536L512 612.352l82.5344-82.5344L512 447.24224z" fill="#d67506"/>
                    </svg>
                    <span style={{fontWeight: "bold"}}>TOKENS</span>
                    <span>{metrics.tokens.total}</span>
                </span>
            </Popover>
            <Popover
                arrow={false}
                placement="bottom"
                open={metrics.costs.total !== "0.0" ? undefined : false}
                content={(
                    <>
                        <div style={{
                            display: "flex",
                            whiteSpace: "nowrap",
                            justifyContent: "space-between",
                        }}>
                            <span>Total</span>
                            <span>{metrics.costs.total}</span>
                        </div>
                        <div style={{
                            display: "flex",
                            whiteSpace: "nowrap",
                            justifyContent: "space-between",
                        }}>
                            <span>Cached</span>
                            <span>{metrics.costs.cached}</span>
                        </div>
                        <Progress
                            percent={100}
                            showInfo={false}
                            strokeLinecap="square"
                            strokeColor={["#0d9488"]}
                            styles={{root: {borderRadius: 8, overflow: "hidden"}}}
                            success={{percent: (Number(metrics.costs.cached) / Number(metrics.costs.total)) * 100, strokeColor: color}}
                        />
                    </>
                )}
                classNames={{container: "inspect-metric-popover"}}
                styles={{content: {color}, container: {background, border}}}
            >
                <span className="inspect-metric" style={{cursor: metrics.costs.total !== "0.0" ? "pointer" : "auto"}}>
                    <svg viewBox="85.333333 85.333333 853.333334 853.333334" version="1.1" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                        <path d="M512 85.333333a426.666667 426.666667 0 0 1 426.666667 426.666667 426.666667 426.666667 0 0 1-426.666667 426.666667A426.666667 426.666667 0 0 1 85.333333 512 426.666667 426.666667 0 0 1 512 85.333333m0 85.333334a341.333333 341.333333 0 0 0-341.333333 341.333333 341.333333 341.333333 0 0 0 341.333333 341.333333 341.333333 341.333333 0 0 0 341.333333-341.333333 341.333333 341.333333 0 0 0-341.333333-341.333333m-42.666667 554.666666v-42.666666H384v-85.333334h170.666667v-42.666666h-128a42.666667 42.666667 0 0 1-42.666667-42.666667V384a42.666667 42.666667 0 0 1 42.666667-42.666667h42.666666V298.666667h85.333334v42.666666h85.333333v85.333334h-170.666667v42.666666h128a42.666667 42.666667 0 0 1 42.666667 42.666667v128a42.666667 42.666667 0 0 1-42.666667 42.666667h-42.666666v42.666666h-85.333334z" fill="#0d9488"/>
                    </svg>
                    <span style={{fontWeight: "bold"}}>COST</span>
                    <span>{metrics.costs.total}</span>
                </span>
            </Popover>
        </div>
    );
}