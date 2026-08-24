import SponsorCampaignForm from "@/components/admin/sponsors/SponsorCampaignForm";

type SponsorCampaignPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SponsorCampaignPage({
  params,
}: SponsorCampaignPageProps) {
  const { id } = await params;

  return <SponsorCampaignForm campaignId={id} />;
}
