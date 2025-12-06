import { useState, useRef, useEffect, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Search, Loader2 } from "lucide-react";
import { ButtonUtility } from "@/components/ui/buttons/button-utility";
import { fetchGeocodedLocation, type GeocodedLocation } from "@/features/media-verification/api/geocoding";
import { cx } from "@/utils/cx";

interface MapSearchControlProps {
    onLocationFound: (location: GeocodedLocation) => void;
}

export function MapSearchControl({ onLocationFound }: MapSearchControlProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [query, setQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                if (query === "") {
                    setIsExpanded(false);
                }
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [query]);

    useEffect(() => {
        if (isExpanded && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isExpanded]);

    const handleSearch = async (e: FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            const location = await fetchGeocodedLocation(query);
            if (location) {
                onLocationFound(location);
                setIsExpanded(false);
                setQuery("");
            } else {
                setError("Location not found");
            }
        } catch (err) {
            setError("Failed to search location");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form ref={containerRef} onSubmit={handleSearch} className="absolute right-3 top-3 z-10">
            <div className="relative flex items-center gap-2">
                <div
                    className={cx(
                        "absolute right-11 top-1/2 z-10 flex w-64 -translate-y-1/2 items-center gap-2 rounded-full border border-secondary/30 bg-primary px-4 py-1 shadow-xs-skeumorphic transition-opacity duration-150 ease-out dark:bg-zinc-900",
                        isExpanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            if (error) setError(null);
                        }}
                        onFocus={() => setIsExpanded(true)}
                        placeholder="Search places..."
                        className="flex-1 border-none bg-transparent text-sm text-secondary placeholder:text-tertiary focus:outline-none dark:placeholder:text-tertiary"
                        disabled={isLoading}
                    />
                </div>

                <div className="relative h-4 w-4">
                    {isLoading && <Loader2 className="absolute inset-0 h-4 w-4 animate-spin text-blue-500" />}
                </div>

                <ButtonUtility
                    tooltip="Search places"
                    icon={Search}
                    size="xs"
                    color="secondary"
                    className="relative rounded-full shadow-xs-skeumorphic"
                    aria-label="Search places"
                    type="submit"
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        if (!isExpanded) {
                            event.preventDefault();
                            setIsExpanded(true);
                            setTimeout(() => inputRef.current?.focus(), 120);
                        }
                    }}
                />
            </div>

            {error && isExpanded && (
                <div className="absolute right-11 top-full mt-2 w-64 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 shadow-sm dark:bg-red-900/20 dark:text-red-400">
                    {error}
                </div>
            )}
        </form>
    );
}
