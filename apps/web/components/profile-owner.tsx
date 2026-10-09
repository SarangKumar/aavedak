"use client";

import { useState } from "react";

import {
  ProfileSettings,
  type ProfileSettingsProfile,
  type ProfileSettingsResume,
} from "@/components/profile-settings";
import { ProfileView } from "@/components/profile-view";
import type { Profile } from "@/lib/profile";

type Props = {
  profile: Profile;
  isOwner: boolean;
  activeResumeTitle: string | null;
  activeResumeId: string | null;
  settingsProfile: ProfileSettingsProfile;
  resumes: ProfileSettingsResume[];
  discoveryEnabled?: boolean;
};

export function ProfileOwner({
  profile,
  isOwner,
  activeResumeTitle,
  activeResumeId,
  settingsProfile,
  resumes,
  discoveryEnabled,
}: Props) {
  const [editing, setEditing] = useState(false);

  if (isOwner && editing) {
    return (
      <div className="space-y-0">
        <ProfileSettings
          profile={settingsProfile}
          initialResumes={resumes}
          initialDiscoveryEnabled={discoveryEnabled}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <ProfileView
      profile={profile}
      isOwner={isOwner}
      activeResumeTitle={activeResumeTitle}
      activeResumeId={activeResumeId}
      onEdit={isOwner ? () => setEditing(true) : undefined}
    />
  );
}
