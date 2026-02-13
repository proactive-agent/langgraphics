import {useEffect, useRef, useState} from "react";
import type {ColorMode} from "@xyflow/react";

interface ControlsProps {
    colorMode: ColorMode;
    setColorMode: (v: ColorMode) => void;
    goAuto: () => void;
    goManual: () => void;
    isManual: boolean;
}

const themeOptions: { value: ColorMode; label: string }[] = [
    {value: "system", label: "System"},
    {value: "light", label: "Light"},
    {value: "dark", label: "Dark"},
];

export function Controls({isManual, colorMode, setColorMode, goAuto, goManual}: ControlsProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        function onClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
        }

        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [open]);

    const current = themeOptions.find((o) => o.value === colorMode)!;

    return (
        <div className="canvas-controls">
            <div className="mode-toggle">
                <button className={isManual ? "" : "active"} onClick={goAuto}>Auto</button>
                <button className={isManual ? "active" : ""} onClick={goManual}>Manual</button>
            </div>
            <div className="theme-select" ref={ref}>
                <button className="theme-select-trigger" onClick={() => setOpen((v) => !v)}>
                    {current.label}
                </button>
                {open && (
                    <div className="theme-select-popup">
                        {themeOptions.map((o) => (
                            <button
                                key={o.value}
                                className={o.value === colorMode ? "selected" : ""}
                                onClick={() => {
                                    setColorMode(o.value);
                                    setOpen(false);
                                }}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
