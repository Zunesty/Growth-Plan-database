import { listClients } from "@/lib/client-hub-clients";
import { listTeam } from "@/lib/client-hub-team";
import { listRecurring } from "@/lib/client-hub-recurring";
import { listOnboardingItems } from "@/lib/client-hub-onboarding";
import { listTasks } from "@/lib/client-hub-taskops";
import { apiError } from "@/lib/client-hub-http";
import type { BootstrapPayload } from "@/lib/client-hub-types";

export async function GET() {
  try {
    const [clients, team, recurring, tasks, onboardingItems] = await Promise.all([
      listClients(),
      listTeam(),
      listRecurring(),
      listTasks({ completedSinceDays: 7 }),
      listOnboardingItems(),
    ]);

    const payload: BootstrapPayload = {
      clients,
      team,
      recurring,
      tasks,
      proposals: [], // populated once the AI sweep ships
      onboardingItems,
    };
    return Response.json(payload);
  } catch (e) {
    const { status, body } = apiError(e);
    return Response.json(body, { status });
  }
}
