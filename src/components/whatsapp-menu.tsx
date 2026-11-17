import { MessageCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { Job } from "@/lib/job";
import { fillTemplate, type TemplateKey } from "@/lib/messages";
import { whatsappLink } from "@/lib/phone";
import { useStore } from "@/lib/store";

/** Opens WhatsApp with a filled-in template, or a blank chat. */
export function WhatsAppMenu({
  phone,
  name,
  job,
  only,
}: {
  phone: string;
  name: string;
  job?: Job;
  /** Restrict to these templates, e.g. just the reminder on a customer. */
  only?: TemplateKey[];
}) {
  const { settings } = useStore();
  const base = whatsappLink(phone);
  if (!base) return null;
  const templates = settings.messages.filter((t) => !only || only.includes(t.key));
  const vars = { name, company: settings.company.name, phone: settings.company.phone, job };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <MessageCircle /> WhatsApp
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Send a message
        </DropdownMenuLabel>
        {templates.map((t) => (
          <DropdownMenuItem key={t.key} asChild>
            <a
              href={whatsappLink(phone, fillTemplate(t.text, vars)) ?? base}
              target="_blank"
              rel="noreferrer"
            >
              {t.label}
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={base} target="_blank" rel="noreferrer">
            Blank chat
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
