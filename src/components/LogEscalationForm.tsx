import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, type Category } from "@/lib/escalations";

export type NewEscalation = {
  client: string;
  description: string;
  category: Category;
  receivedAt: string;
};

/** Value for a datetime-local input, in the user's local time. */
const localNow = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function LogEscalationForm({ onSubmit }: { onSubmit: (e: NewEscalation) => void }) {
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [received, setReceived] = useState(localNow);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!client.trim() || !description.trim() || !category || !received)
          return setError("Please complete all fields.");
        const when = new Date(received);
        if (when.getTime() > Date.now() + 60_000)
          return setError("Date received cannot be in the future.");
        onSubmit({
          client: client.trim(),
          description: description.trim(),
          category,
          receivedAt: when.toISOString(),
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="client">Client name</Label>
        <Input
          id="client"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Northgate Capital Partners"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Issue description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="What happened, amounts involved, deadlines, and who is affected."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger id="category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="received">Date received</Label>
          <Input
            id="received"
            type="datetime-local"
            value={received}
            max={localNow()}
            onChange={(e) => setReceived(e.target.value)}
          />
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-md bg-surface-subtle px-3 py-2 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-navy" />
        On submit, AI assigns severity, an SLA deadline within policy and a likely root cause. You
        can adjust severity afterwards.
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full">
        Log and triage
      </Button>
    </form>
  );
}
