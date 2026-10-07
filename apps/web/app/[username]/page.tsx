type Props = { params: Promise<{ username: string }> };

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">@{username}</h1>
      <p className="mt-2 text-sm text-neutral-400">Shareable profile (placeholder).</p>
    </main>
  );
}
