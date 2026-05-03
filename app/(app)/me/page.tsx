import { H, Body, Btn, Label, Card } from "@/components/ds";
import { signOut } from "@/app/(auth)/login/actions";

export default function MePage() {
  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-2xl mx-auto flex flex-col gap-6">
      <Label>profile</Label>
      <H size="xl" as="h1">
        Me
      </H>
      <Body size="lg" dim>
        Profile, targets, diet, schedule, appearance, and account — full
        settings page is in the design backlog.
      </Body>

      <Card className="p-6 flex flex-col gap-3 mt-4">
        <Label>account</Label>
        <Body size="sm">
          Sign out of Hestia. Your data stays put.
        </Body>
        <form action={signOut}>
          <Btn variant="outline" type="submit">
            sign out
          </Btn>
        </form>
      </Card>
    </div>
  );
}
