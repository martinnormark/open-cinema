import { Container } from "@cloudflare/containers";

/** ffmpeg in a container; the jobs coordinator streams media in and reads the MP4 back. */
export class MediaContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  // Inputs arrive in the request body, so the container needs no network.
  enableInternet = false;
}
