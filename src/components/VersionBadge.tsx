
import React from 'react';
import { APP_VERSION, BUILD_TIME } from '../version';

export const VersionBadge = ({ className = "" }: { className?: string }) => {
    return (
        <div className={`text-center ${className}`}>
            <div className="font-semibold">Totalgest Pro v{APP_VERSION}</div>
            {BUILD_TIME && (
                <div className="mt-1 opacity-50 text-[10px]">
                    Build: {new Date(BUILD_TIME).toLocaleString()}
                </div>
            )}
        </div>
    );
};
