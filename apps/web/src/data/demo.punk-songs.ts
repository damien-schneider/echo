import { createServerFn } from "@tanstack/react-start";

export const getPunkSongs = createServerFn({
  method: "GET",
}).handler(async () => [
  { artist: "Wheatus", id: 1, name: "Teenage Dirtbag" },
  { artist: "Nirvana", id: 2, name: "Smells Like Teen Spirit" },
  { artist: "Jimmy Eat World", id: 3, name: "The Middle" },
  { artist: "Lit", id: 4, name: "My Own Worst Enemy" },
  { artist: "Sum 41", id: 5, name: "Fat Lip" },
  { artist: "blink-182", id: 6, name: "All the Small Things" },
  { artist: "Weezer", id: 7, name: "Beverly Hills" },
]);
