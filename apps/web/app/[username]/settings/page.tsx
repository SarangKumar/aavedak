type Props = { params: Promise<{ username: string }> };

export default async function ProfileSettingsPage({ params }: Props) {
  const { username } = await params;
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">@{username} / settings</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Profile settings including resume upload, activate, and deactivate.
      </p>
    </main>
  );
}
