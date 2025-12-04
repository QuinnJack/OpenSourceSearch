import { useState, useRef, useEffect, type FormEvent } from "react";
import { Search, Loader2, X } from "lucide-react";
import { cx } from "@/utils/cx";
import { fetchGeocodedLocation, type GeocodedLocation } from "@/features/media-verification/api/geocoding";

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
        <div
            ref={containerRef}
            className={cx(
                "absolute right-2 top-2 z-10 flex items-center rounded-lg transition-all duration-300 ease-in-out",
                "bg-primary text-secondary shadow-xs-skeumorphic hover:bg-primary_hover hover:text-secondary_hover",
                isExpanded ? "w-64 p-2" : "w-9 h-9 justify-center cursor-pointer"
            )}
            onClick={!isExpanded ? toggleExpand : undefined}
        >
            <form onSubmit={handleSearch} className="flex w-full items-center relative">
                {!isExpanded ? (
                    <Search className="h-4 w-4 text-fg-quaternary" />
                ) : (
                    <>
                        <Search className="absolute left-2 h-4 w-4 text-gray-400" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                if (error) setError(null);
                            }}
                            placeholder="Search places..."
                            className="h-8 w-full rounded-md border border-transparent bg-gray-100 pl-8 pr-8 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 dark:bg-slate-800 dark:text-gray-100 dark:focus:bg-slate-900"
                            disabled={isLoading}
                        />
                        {query && !isLoading && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="absolute right-2 rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700"
                            >
                                <X className="h-3 w-3 text-gray-500" />
                            </button>
                        )}
                        {isLoading && (
                            <div className="absolute right-2">
                                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                            </div>
                        )}
                    </>
                )}
            </form>
            {error && isExpanded && (
                <div className="absolute top-full right-0 mt-1 w-full rounded-md bg-red-50 p-2 text-xs text-red-600 shadow-sm dark:bg-red-900/20 dark:text-red-400">
                    {error}
                </div>
            )}
        </div>
    );
}
