import { useEffect, useMemo, useState } from "react";
// import {
//   LineChart,
//   Line,
//   XAxis,
//   YAxis,
//   Tooltip,
//   ResponsiveContainer,
//   CartesianGrid,
// } from "recharts";
import { format } from "date-fns";
import { FaSearch, FaMapMarkerAlt, FaStar, FaRegStar, FaTrash } from "react-icons/fa";
// Utility: Convert AQI to approximate cigarette equivalent
const getCigaretteEquivalent = (aqi: number | null): number => {
  if (aqi === null) return 0;       // Handle null safely

  if (aqi <= 50) return 0;          // Good
  if (aqi <= 100) return 2;         // Moderate
  if (aqi <= 200) return 5;         // Unhealthy
  if (aqi <= 300) return 8;         // Very Unhealthy
  if (aqi <= 400) return 13;        // Very Unhealthy
  return 13;                         // Hazardous
};


type Pollutants = {
  pm25?: number;
  pm10?: number;
  no2?: number;
  so2?: number;
  co?: number;
  o3?: number;
};

type ForecastDay = {
  day: string;
  pm25?: number | null;
  pm10?: number | null;
  o3?: number | null;
  aqi?: number | null;
};

const API_KEY = "50ea8278f60975d859e0143bec4fd4ea7dc5a9c6";
// (You can replace API_KEY above or set VITE_WAQI_API_KEY in .env)

const STORAGE_KEY = "aqi_favorites_v1";

// Health advice mapping
function getHealthAdvice(aqi: number) {
  if (aqi <= 50) {
    return {
      level: "Good",
      action: "Air quality is good — enjoy outdoor activities.",
      mask: false,
    };
  }
  if (aqi <= 100) {
    return {
      level: "Moderate",
      action: "Some sensitive people should reduce strenuous outdoor activity.",
      mask: false,
    };
  }
  if (aqi <= 150) {
    return {
      level: "Unhealthy for Sensitive Groups",
      action: "People with respiratory conditions should limit outdoor exposure. Consider wearing an N95 for long time outdoors.",
      mask: true,
    };
  }
  if (aqi <= 200) {
    return {
      level: "Unhealthy",
      action: "Avoid extended outdoor exertion. Use an N95/KN95 mask outdoors.",
      mask: true,
    };
  }
  if (aqi <= 300) {
    return {
      level: "Very Unhealthy",
      action: "Stay indoors and use air purifiers if possible. Masks strongly recommended outdoors.",
      mask: true,
    };
  }
  return {
    level: "Hazardous",
    action: "Remain indoors, avoid all outdoor activity. Seek medical advice if symptoms occur.",
    mask: true,
  };
}

// color for gauge and number
function aqiColor(aqi: number) {
  if (aqi <= 50) return "bg-green-500 text-green-900";
  if (aqi <= 100) return "bg-yellow-400 text-yellow-900";
  if (aqi <= 150) return "bg-orange-500 text-orange-900";
  if (aqi <= 200) return "bg-red-500 text-red-900";
  if (aqi <= 300) return "bg-purple-600 text-purple-100";
  return "bg-rose-900 text-rose-100";
}

export default function AqiAdvanced(): JSX.Element {
  const [city, setCity] = useState<string>("");
  const [aqi, setAqi] = useState<number | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [pollutants, setPollutants] = useState<Pollutants>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[] | null>(null);
  const [hourlyData, setHourlyData] = useState<{ time: string; value: number }[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // helper: save favorites
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  // Auto-detect on mount
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetchByGeo(latitude, longitude);
      },
      () => {
        // permission denied or unavailable — ignore silently
      },
      { timeout: 8000 }
    );
  }, []);

  const fetchByGeo = async (lat: number, lon: number) => {
    // WAQI supports feed/geo:lat;lon
    const q = `geo:${lat};${lon}`;
    await fetchAndSet(q);
  };

  // main fetch function
  const fetchAndSet = async (query: string) => {
    setLoading(true);
    setError(null);
    setAqi(null);
    setPollutants({});
    setForecast(null);
    setHourlyData([]);

    try {
      const url = `https://api.waqi.info/feed/${encodeURIComponent(query)}/?token=${API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Network error");
      const json = await res.json();

      if (json.status === "error") {
        setError(json.data ?? "City not found or API error");
        setLoading(false);
        return;
      }

      const d = json.data;
      // core info
      setAqi(typeof d.aqi === "number" ? d.aqi : (Number(d.aqi) || null));
      setLocationName(d.city?.name ?? query);

      // pollutants
      const iaqi = d.iaqi || {};
      setPollutants({
        pm25: iaqi.pm25?.v ?? undefined,
        pm10: iaqi.pm10?.v ?? undefined,
        no2: iaqi.no2?.v ?? undefined,
        so2: iaqi.so2?.v ?? undefined,
        co: iaqi.co?.v ?? undefined,
        o3: iaqi.o3?.v ?? undefined,
      });

      // forecast: WAQI returns forecast.daily for pm25/pm10/o3 usually
      const f: ForecastDay[] = [];
      if (d.forecast && d.forecast?.daily) {
        const daily = d.forecast.daily;
        // preferred fields: pm25, pm10, o3 (some have pm25 as an array of {day, avg, max})
        const keys = Object.keys(daily);
        // produce up to 3 days
        for (const k of keys) {
          // daily[k] is array of {day: "YYYY-MM-DD", avg: N}
          const arr = daily[k] as any[];
          if (!Array.isArray(arr)) continue;
          for (const entry of arr.slice(0, 3)) {
            const dayStr = entry.day;
            const existing = f.find((x) => x.day === dayStr);
            if (!existing) {
              f.push({
                day: dayStr,
                pm25: daily.pm25?.find((it: any) => it.day === dayStr)?.avg ?? null,
                pm10: daily.pm10?.find((it: any) => it.day === dayStr)?.avg ?? null,
                o3: daily.o3?.find((it: any) => it.day === dayStr)?.avg ?? null,
                aqi: null,
              });
            } else {
              // combine
            }
            if (f.length >= 3) break;
          }
          if (f.length >= 3) break;
        }
      }

      setForecast(f.length ? f : null);

      // hourly / historical: WAQI doesn't always give hourly arrays on feed endpoint.
      // Best-effort: some stations include "time" or "history" but not consistent.
      // We'll try to build a 24-hour set from "forecast.hourly" or fallback to iaqi values.
      const hourly: { time: string; value: number }[] = [];
      if (d.forecast?.hourly) {
        // if exists, iterate
        try {
          const hourlyObj = d.forecast.hourly; // maybe pm25
          // prefer pm25 hourly
          if (hourlyObj.pm25 && Array.isArray(hourlyObj.pm25)) {
            for (const it of hourlyObj.pm25.slice(0, 24)) {
              hourly.push({
                time: it.hour ?? it.day ?? "",
                value: Number(it.avg ?? it.v ?? it),
              });
            }
          }
        } catch {}
      }

      if (!hourly.length) {
        // fallback: create a synthetic 8-point series from iaqi values (pm25/pm10/o3)
        const now = Date.now();
        const keys: Array<[string, number | undefined]> = [
          ["pm25", iaqi.pm25?.v],
          ["pm10", iaqi.pm10?.v],
          ["o3", iaqi.o3?.v],
          ["no2", iaqi.no2?.v],
          ["so2", iaqi.so2?.v],
          ["co", iaqi.co?.v],
        ];
        let idx = 0;
        for (const [k, v] of keys) {
          hourly.push({
            time: format(new Date(now - idx * 60 * 60 * 1000), "HH:mm"),
            value: v ?? 0,
          });
          idx++;
        }
      }
      setHourlyData(hourly.slice(0, 24));
    } catch (err: any) {
      setError(err.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // user actions
  const onSearch = () => {
    if (!city.trim()) return;
    fetchAndSet(city.trim());
  };

  const toggleFavorite = (name: string) => {
    setFavorites((prev) => {
      if (prev.includes(name)) return prev.filter((p) => p !== name);
      return [name, ...prev].slice(0, 10);
    });
  };

  const removeFavorite = (name: string) => {
    setFavorites((prev) => prev.filter((p) => p !== name));
  };

  const loadFavorite = (name: string) => {
    setCity(name);
    fetchAndSet(name);
  };

  // derived UI data
  const advice = useMemo(() => (aqi !== null ? getHealthAdvice(aqi) : null), [aqi]);
  const gaugeRotation = useMemo(() => {
    // map 0..500 to 0..180 degrees
    const v = aqi ?? 0;
    const capped = Math.max(0, Math.min(500, v));
    return (capped / 500) * 180;
  }, [aqi]);

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-sky-900 via-indigo-900 to-black text-gray-100 flex flex-col items-center">
      <div className="w-full max-w-6xl">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold">AQI Live Dashboard</h1>
            <p className="text-sm text-gray-300 mt-1">
              Real-time air quality, pollutants, forecasts & advice
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/5 rounded-full px-3 py-2 gap-2 shadow-sm">
              <FaSearch className="text-gray-300" />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                className="bg-transparent outline-none placeholder-gray-400 text-sm md:text-base w-40 md:w-72"
                placeholder="Search city or 'geo:lat;lon'"
                aria-label="Search city"
              />
            </div>

            <button
              onClick={onSearch}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow hover:scale-105 transition transform"
            >
              Search
            </button>

            <button
              onClick={() => {
                if (!("geolocation" in navigator)) {
                  setError("Geolocation not supported by your browser");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) => fetchByGeo(pos.coords.latitude, pos.coords.longitude),
                  () => setError("Location permission denied"),
                  { timeout: 8000 }
                );
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl shadow hover:bg-white/10 transition"
              title="Use my location"
            >
              <FaMapMarkerAlt />
              <span className="hidden md:inline text-sm">Use my location</span>
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Gauge + basic */}
          <section className="col-span-1 bg-white/6 rounded-2xl p-5 backdrop-blur-md shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Location</h2>
                <p className="text-sm text-gray-300">{locationName || "—"}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (!locationName) return;
                    toggleFavorite(locationName);
                  }}
                  className="p-2 rounded-lg hover:bg-white/5 transition"
                  title="Toggle favorite"
                >
                  {favorites.includes(locationName) ? (
                    <FaStar className="text-yellow-400" />
                  ) : (
                    <FaRegStar />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-4">
              <div className="relative w-64 h-36">
                {/* semicircle background */}
                <div className="absolute inset-0 flex items-end justify-center">
                  <div className="w-64 h-32 rounded-b-full border-4 border-white/10"></div>
                </div>

                {/* needle */}
                <div
                  className="absolute left-1/2 bottom-4 w-1 h-20 bg-white origin-bottom rounded"
                  style={{
                    transform: `translateX(-50%) rotate(${gaugeRotation}deg)`,
                    transition: "transform 0.8s cubic-bezier(.2,.9,.2,1)",
                  }}
                />

                {/* center cap */}
                <div className="absolute left-1/2 bottom-10 w-4 h-4 bg-white rounded-full translate-x-[-50%]" />
              </div>

              <div className="text-center">
                <div
                  className={`inline-flex items-baseline gap-3 px-4 py-3 rounded-2xl ${aqi !== null ? aqiColor(aqi) : "bg-white/5"}`}
                >
                  <span className="text-3xl font-extrabold">{aqi ?? "—"}</span>
                  <span className="text-sm opacity-80">{aqi !== null ? getHealthAdvice(aqi).level : ""}</span>
                </div>

                <p className="mt-3 text-sm text-gray-300 max-w-xs">
                  {advice?.action ?? "Search a city or allow location access to see recommendations."}
                </p>
              </div>

              <div className="mt-4 w-full grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-white/5 rounded p-2">
                  <div className="text-sm">PM2.5</div>
                  <div className="font-semibold mt-1">{pollutants.pm25 ?? "N/A"}</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-sm">PM10</div>
                  <div className="font-semibold mt-1">{pollutants.pm10 ?? "N/A"}</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-sm">O₃</div>
                  <div className="font-semibold mt-1">{pollutants.o3 ?? "N/A"}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Middle: Graph + hourly */}
          <section className="col-span-1 lg:col-span-2 bg-white/6 rounded-2xl p-5 backdrop-blur-md shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">24-Hour Trend</h3>
              <div className="text-sm text-gray-300">Values shown are best-effort / available</div>
            </div>

<div className="w-full h-48 bg-black/30 rounded-3xl backdrop-blur-xl flex flex-col items-center justify-center shadow-xl">
  <h3 className="text-white text-xl font-bold">🚬 Cigarette Equivalent</h3>
  <p className="text-gray-300 text-sm mt-1">Breathing this air for a day =</p>
  <p className="text-4xl font-bold text-red-400 mt-2">
    {getCigaretteEquivalent(aqi)} cigarettes
  </p>
</div>



            {/* Forecast if available */}
            <div className="mt-6">
              <h4 className="text-md font-semibold mb-3">3-Day Forecast</h4>
              {forecast ? (
                <div className="flex gap-3">
                  {forecast.map((f) => (
                    <div key={f.day} className="bg-white/5 p-4 rounded-lg flex-1">
                      <div className="text-sm text-gray-300">{format(new Date(f.day), "eee, MMM d")}</div>
                      <div className="text-lg font-bold mt-2">{f.pm25 ?? "—"} µg/m³ (PM2.5)</div>
                      <div className="text-xs text-gray-300 mt-1">PM10: {f.pm10 ?? "—"}</div>
                      <div className="text-xs text-gray-300 mt-1">O₃: {f.o3 ?? "—"}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">Forecast not available for this station.</div>
              )}
            </div>
          </section>

          {/* Right-most column: Pollutants, favorites, actions */}
          <section className="col-span-1 bg-white/6 rounded-2xl p-5 backdrop-blur-md shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Pollutant Details</h3>
              <div className="text-xs text-gray-300">µg/m³ unless otherwise noted</div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {[
                ["PM2.5", pollutants.pm25],
                ["PM10", pollutants.pm10],
                ["NO₂", pollutants.no2],
                ["SO₂", pollutants.so2],
                ["CO (ppm)", pollutants.co],
                ["O₃", pollutants.o3],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between items-center bg-white/5 p-3 rounded">
                  <div className="text-sm">{label}</div>
                  <div className="font-semibold">{val ?? "N/A"}</div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h4 className="text-md font-semibold mb-2">Quick Actions</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!locationName) return;
                    toggleFavorite(locationName);
                  }}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-lg text-black font-semibold"
                >
                  {favorites.includes(locationName) ? "Unfavorite" : "Add Favorite"}
                </button>
                <button
                  onClick={() => {
                    setCity("");
                    setAqi(null);
                    setLocationName("");
                    setForecast(null);
                    setHourlyData([]);
                    setPollutants({});
                    setError(null);
                  }}
                  className="px-3 py-2 bg-white/5 rounded-lg"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="text-md font-semibold mb-2">Saved Cities</h4>
              <div className="flex flex-col gap-2">
                {favorites.length ? (
                  favorites.map((f) => (
                    <div key={f} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded">
                      <button onClick={() => loadFavorite(f)} className="text-left">
                        {f}
                      </button>
                      <div className="flex items-center gap-2">
                        <button onClick={() => loadFavorite(f)} className="px-2 py-1 bg-white/6 rounded">
                          Load
                        </button>
                        <button onClick={() => removeFavorite(f)} className="px-2 py-1 bg-red-600 rounded text-white">
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400">No saved cities yet — add one!</div>
                )}
              </div>
            </div>

            <div className="mt-6 text-xs text-gray-400">
              <div>Note: Data comes from the WAQI platform. Forecast/historical availability varies by station.</div>
              <div className="mt-2">For production, move the API key into a .env file (VITE_WAQI_API_KEY) and do not commit it to git.</div>
            </div>
          </section>
        </main>

        {/* Error / Loading toast */}
        <div className="fixed bottom-6 right-6">
          {loading && (
            <div className="px-4 py-2 bg-white/5 rounded shadow">Fetching data...</div>
          )}
          {error && (
            <div className="px-4 py-2 bg-red-700 text-white rounded shadow">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}



// import React, { useState } from "react";

// interface Pollutants {
//   pm25?: number;
//   pm10?: number;
//   no2?: number;
//   so2?: number;
//   co?: number;
//   o3?: number;
// }

// interface AqiInfo {
//   text: string;
//   color: string;
//   advice: string;
//   risk: string;
// }

// const Aqi: React.FC = () => {
//   const [city, setCity] = useState<string>("");
//   const [aqi, setAqi] = useState<number | null>(null);
//   const [pollutants, setPollutants] = useState<Pollutants>({});
//   const [location, setLocation] = useState<string>("");
//   const [loading, setLoading] = useState<boolean>(false);
//   const [error, setError] = useState<string>("");

//   const API_KEY = "50ea8278f60975d859e0143bec4fd4ea7dc5a9c6";

//   const getAQI = async () => {
//     if (!city) return;

//     setLoading(true);
//     setError("");
//     setAqi(null);
//     setPollutants({});

//     try {
//       const response = await fetch(
//         `https://api.waqi.info/feed/${city}/?token=${API_KEY}`
//       );

//       const data = await response.json();

//       if (data.status === "error") {
//         setError("City not found!");
//       } else {
//         setAqi(data.data.aqi);
//         setLocation(data.data.city.name);

//         setPollutants({
//           pm25: data.data.iaqi.pm25?.v,
//           pm10: data.data.iaqi.pm10?.v,
//           no2: data.data.iaqi.no2?.v,
//           so2: data.data.iaqi.so2?.v,
//           co: data.data.iaqi.co?.v,
//           o3: data.data.iaqi.o3?.v,
//         });
//       }
//     } catch {
//       setError("Could not fetch AQI data");
//     }

//     setLoading(false);
//   };

//   const getAqiInfo = (value: number): AqiInfo => {
//     if (value <= 50)
//       return {
//         text: "Good",
//         color: "text-green-400",
//         advice: "Air quality is excellent. Outdoor activities are completely safe.",
//         risk: "No health risk.",
//       };

//     if (value <= 100)
//       return {
//         text: "Moderate",
//         color: "text-yellow-400",
//         advice: "Air quality is acceptable. Sensitive individuals may feel mild irritation.",
//         risk: "Low risk for sensitive groups.",
//       };

//     if (value <= 150)
//       return {
//         text: "Unhealthy for Sensitive Groups",
//         color: "text-orange-400",
//         advice: "Avoid long outdoor exposure if you are asthmatic or elderly.",
//         risk: "Higher risk for children, elderly, and heart/lung patients.",
//       };

//     if (value <= 200)
//       return {
//         text: "Unhealthy",
//         color: "text-red-500",
//         advice: "Wear a mask outdoors. Reduce outdoor physical activity.",
//         risk: "Increased risk for everyone.",
//       };

//     if (value <= 300)
//       return {
//         text: "Very Unhealthy",
//         color: "text-purple-500",
//         advice:
//           "Avoid going outside. Use an N95 mask. Air purifiers recommended indoors.",
//         risk: "High health risk.",
//       };

//     return {
//       text: "Hazardous",
//       color: "text-rose-900",
//       advice:
//         "Stay indoors strictly. Use strong protection masks (N95/N99). Keep windows closed.",
//       risk: "Severe health danger.",
//     };
//   };

//   // Cigarette equivalent – based on WHO research: ~AQI 22 ≈ 1 cigarette
//   const getCigaretteEquivalent = (aqi: number): string => {
//     return (aqi / 22).toFixed(1);
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex flex-col items-center p-6">

//       <h1 className="text-5xl font-extrabold text-white drop-shadow-md mb-10">
//         🌍 AQI Live Dashboard
//       </h1>

//       {/* Search Box */}
//       <div className="flex gap-3 mb-10">
//         <input
//           type="text"
//           placeholder="Search city..."
//           className="px-4 py-2 rounded-xl w-72 bg-white/10 text-white backdrop-blur-xl shadow-md placeholder-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
//           value={city}
//           onChange={(e) => setCity(e.target.value)}
//         />

//         <button
//           onClick={getAQI}
//           className="px-5 py-2 bg-blue-500 text-white rounded-xl shadow-md hover:bg-blue-600 transition-all"
//         >
//           Search
//         </button>
//       </div>

//       {loading && <p className="text-white text-xl">Loading...</p>}
//       {error && <p className="text-red-400 text-xl font-semibold">{error}</p>}

//       {aqi !== null && (
//         <>
//           {/* AQI Number */}
//           <div className="text-center mb-6 animate-fadeIn">
//             <p className="text-white text-2xl">{location}</p>
//             <h2 className={`text-6xl font-bold mt-3 ${getAqiInfo(aqi).color}`}>
//               {aqi}
//             </h2>
//             <p className="text-gray-300 text-xl mt-2">{getAqiInfo(aqi).text}</p>
//           </div>

//           {/* Cigarette Equivalent */}
//           <div className="bg-black/30 p-6 rounded-3xl backdrop-blur-xl w-[90%] md:w-[40%] mb-6 text-center shadow-xl">
//             <h3 className="text-white text-2xl font-bold mb-2">🚬 Cigarette Equivalent</h3>
//             <p className="text-gray-300 text-lg">Breathing this air for a day is equal to:</p>
//             <p className="text-4xl font-bold text-red-400 mt-2">
//               {getCigaretteEquivalent(aqi)} cigarettes
//             </p>
//           </div>

//           {/* Health Advisory */}
//           <div className="bg-white/10 p-6 rounded-3xl backdrop-blur-xl w-[90%] md:w-[50%] mb-6">
//             <h3 className="text-2xl font-bold text-white mb-3">Health Advisory</h3>
//             <p className="text-gray-300 mb-2">
//               <span className="font-semibold text-white">Advice: </span>
//               {getAqiInfo(aqi).advice}
//             </p>
//             <p className="text-gray-300">
//               <span className="font-semibold text-white">Risk Level: </span>
//               {getAqiInfo(aqi).risk}
//             </p>
//           </div>

//           {/* Pollutants */}
//           <div className="grid grid-cols-2 gap-4 bg-white/10 p-6 rounded-3xl backdrop-blur-xl w-[90%] md:w-[40%]">
//             {Object.entries(pollutants).map(([key, value]) => (
//               <div
//                 key={key}
//                 className="bg-black/20 p-4 rounded-xl text-white shadow-lg flex justify-between"
//               >
//                 <span className="font-semibold uppercase">{key}</span>
//                 <span className="text-lg font-bold">{value ?? "N/A"}</span>
//               </div>
//             ))}
//           </div>
//         </>
//       )}
//     </div>
//   );
// };

// export default Aqi;
