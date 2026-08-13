import type { Metadata } from "next";
import { GuertechApp } from "@/components/guertech/GuertechApp";
import "./guertech.css";

export const metadata: Metadata = {
  title: "Guertech · Dispatch",
  description:
    "Prototype dispatch Guertech : contraintes, appels préventif/réactif, routes Google Maps.",
};

export default function GuertechPage() {
  return <GuertechApp />;
}
