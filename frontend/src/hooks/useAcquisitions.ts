import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { acquisitionsApi, artifactsApi, discoveryApi, filesApi, manifestApi, stagesApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export const useAcquisitions = () =>
    useQuery({
        queryKey: queryKeys.acquisitions,
        queryFn: acquisitionsApi.list,
    });

export const useAcquisitionDetail = (acquisitionId: string) =>
    useQuery({
        queryKey: queryKeys.acquisition(acquisitionId),
        queryFn: () => acquisitionsApi.detail(acquisitionId),
        enabled: Boolean(acquisitionId),
    });

export const useCreateAcquisition = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: acquisitionsApi.create,
        onSuccess: (acquisition) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.acquisitions });
            queryClient.setQueryData(queryKeys.acquisition(acquisition.id), acquisition);
        },
    });
};

export const useArchiveAcquisition = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: acquisitionsApi.archive,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.acquisitions });
        },
    });
};

export const useAcquisitionFiles = (acquisitionId: string) =>
    useQuery({
        queryKey: queryKeys.acquisitionFiles(acquisitionId),
        queryFn: () => filesApi.list(acquisitionId),
        enabled: Boolean(acquisitionId),
    });

export const useUploadFiles = (acquisitionId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (files: File[]) => filesApi.upload(acquisitionId, files),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.acquisitionFiles(acquisitionId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.acquisition(acquisitionId) });
        },
    });
};

export const useRunStage = (acquisitionId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (stage: number) => stagesApi.run(acquisitionId, stage),
        onSuccess: (_, stage) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.stageStatus(acquisitionId, stage) });
            queryClient.invalidateQueries({ queryKey: queryKeys.acquisition(acquisitionId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.artifacts(acquisitionId) });
        },
    });
};

export const useStageStatus = (acquisitionId: string, stage: number, enabled = true) =>
    useQuery({
        queryKey: queryKeys.stageStatus(acquisitionId, stage),
        queryFn: () => stagesApi.status(acquisitionId, stage),
        enabled: Boolean(acquisitionId) && enabled,
        refetchInterval: 3000,
    });

export const useStageArtifact = (acquisitionId: string, stage: number, enabled = true) =>
    useQuery({
        queryKey: queryKeys.stageArtifact(acquisitionId, stage),
        queryFn: () => stagesApi.artifact(acquisitionId, stage),
        enabled: Boolean(acquisitionId) && enabled,
    });

export const useDiscovery = (acquisitionId: string) =>
    useQuery({
        queryKey: queryKeys.discovery(acquisitionId),
        queryFn: () => discoveryApi.list(acquisitionId),
        enabled: Boolean(acquisitionId),
    });

export const useUpdateDiscovery = (acquisitionId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ questionKey, answer }: { questionKey: string; answer: string }) =>
            discoveryApi.update(acquisitionId, questionKey, answer),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.discovery(acquisitionId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.acquisition(acquisitionId) });
        },
    });
};

export const useManifest = (acquisitionId: string) =>
    useQuery({
        queryKey: queryKeys.manifest(acquisitionId),
        queryFn: () => manifestApi.getManifest(acquisitionId),
        enabled: Boolean(acquisitionId),
    });

export const useManifestOverrides = (acquisitionId: string) =>
    useQuery({
        queryKey: queryKeys.manifestOverrides(acquisitionId),
        queryFn: () => manifestApi.getOverrides(acquisitionId),
        enabled: Boolean(acquisitionId),
    });

export const useUpsertManifestOverride = (acquisitionId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: Record<string, unknown>) => manifestApi.upsertOverride(acquisitionId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.manifestOverrides(acquisitionId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.manifest(acquisitionId) });
        },
    });
};

export const useArtifacts = (acquisitionId: string) =>
    useQuery({
        queryKey: queryKeys.artifacts(acquisitionId),
        queryFn: () => artifactsApi.list(acquisitionId),
        enabled: Boolean(acquisitionId),
    });
