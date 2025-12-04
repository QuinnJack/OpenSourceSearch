import { useState, useRef, useEffect, type FormEvent } from "react";
import { Search, Loader2, X } from "lucide-react";
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
    const containerRef = useRef<HTMLDivElement>(null);
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

    const toggleExpand = () => {
        setIsExpanded(true);
    };

    const clearSearch = (e: React.MouseEvent) => {
        e.stopPropagation();
        setQuery("");
        setError(null);
        inputRef.current?.focus();
    };

    return (
        <form
            ref={containerRef}
            onSubmit={handleSearch}
        className={cx(
            "absolute right-3 top-3 z-10 flex items-center rounded-full border border-secondary/30 bg-primary px-2 transition-all duration-300 ease-out shadow-xs-skeumorphic hover:bg-primary_hover dark:bg-zinc-900",
            isExpanded ? "w-64 px-4 py-1" : "w-10 h-10 px-0 justify-center"
        )}
        >
        <div
            className={cx(
                "flex items-center gap-2 transition-all duration-300",
                isExpanded ? "flex-1 opacity-100" : "w-0 opacity-0 pointer-events-none"
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
                className="flex-1 border-none bg-transparent px-1 text-sm text-secondary placeholder:text-tertiary focus:outline-none dark:placeholder:text-tertiary"
                disabled={isLoading}
            />
            {query && !isLoading && (
                <button
                    type="button"
                    onClick={clearSearch}
                    className="ml-1 rounded-full text-tertiary transition hover:bg-secondary/10 dark:hover:bg-white/10"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
        <ButtonUtility
            tooltip="Search places"
            icon={Search}
            size="xs"
            color="secondary"
            className="rounded-full shadow-xs-skeumorphic"
            aria-label="Search places"
            type="submit"
            onClick={(event) => {
                if (!isExpanded) {
                    event.preventDefault();
                    setIsExpanded(true);
                    setTimeout(() => inputRef.current?.focus(), 120);
                }
            }}
        />
        {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        )}
            {error && isExpanded && (
                <div className="absolute top-full mr-32 mt-1 w-full rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 shadow-sm dark:bg-red-900/20 dark:text-red-400">
                    {error}
                </div>
            )}
        </form>
    );
}
