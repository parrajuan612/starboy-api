import { http } from "@/lib/api-client";
import type { HomeContent } from "@/types";

export const getHomeContent = () => http.get<HomeContent>("/admin/home");
export const saveHomeContent = (c: HomeContent) => http.put<HomeContent>("/admin/home", c);
