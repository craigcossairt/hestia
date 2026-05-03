// Family member shape stored in profiles.family_json.

export interface FamilyMember {
  id: string;
  name: string;
  age: number;
  sex?: "male" | "female" | "other";
  dietary_restrictions: string[];
  notes?: string;
  portion_modifier?: number; // 0.5 kid, 1.0 adult, 1.2 growing teen / training, etc.
}

export function newFamilyMember(): FamilyMember {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    name: "",
    age: 30,
    dietary_restrictions: [],
    portion_modifier: 1,
  };
}
