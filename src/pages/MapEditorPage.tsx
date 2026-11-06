import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, Play, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { KeyboardEvent as ReactKeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CATEGORY_OPTIONS } from '@/entities/category';
import {
  AudioProcessingFailureCode,
  AudioProcessingFailureType,
  MapEditorDetail,
  MapEditorQuestion,
  QuestionMediaProcessingStatus,
  QuestionType,
} from '@/entities/map';
import { assetApi } from '@/features/assets/asset-api';
import { CropSettings, cropImageToBlob } from '@/features/assets/crop-image';
import { mapApi } from '@/features/maps/map-api';
import { toApiErrorMessage } from '@/shared/api/http-client';
import { queryKeys } from '@/shared/api/query-keys';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { questionTypeLabel } from '@/shared/format/display-labels';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { ImageCropPicker } from '@/shared/ui/ImageCropPicker';
import { Modal } from '@/shared/ui/Modal';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Panel } from '@/shared/ui/Panel';
import styles from './map-pages.module.css';

type LocalQuestion = {
  id: string;
  questionId?: number;
  promptText: string;
  answersText: string;
  youtubeUrl: string;
  youtubeDurationSeconds?: number | null;
  startTime: string;
  endTime: string;
  imageFile: File | null;
  imageAssetId?: number;
  imageUrl?: string | null;
  imageCropSettings: CropSettings;
  processingStatus?: QuestionMediaProcessingStatus;
  failureCode?: AudioProcessingFailureCode | null;
  failureType?: AudioProcessingFailureType | null;
  failureMessage?: string | null;
  canRetry?: boolean;
  sourceFailureResolved?: boolean;
};

type QuestionErrorField = 'prompt' | 'youtube' | 'startTime' | 'endTime' | 'image' | 'answers';
type BuiltQuestion = {
  promptText: string;
  media: {
    sourceType: 'UPLOAD' | 'YOUTUBE';
    assetId?: number;
    sourceUrl?: string;
    startTimeMs?: number;
    endTimeMs?: number;
  } | null;
  answers: string[];
};

type EditorSnapshotState = {
  title: string;
  description: string;
  categoryId: number;
  questionType: QuestionType;
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  thumbnailAssetId: number | null;
  thumbnailUrl: string | null;
  thumbnailFile: File | null;
  thumbnailCropSettings: CropSettings;
  questions: LocalQuestion[];
  deletedQuestionIds: number[];
};

type EditorNavigationState = {
  draftSaved?: boolean;
  editorStep?: 1 | 2;
};

const emptyQuestion = (): LocalQuestion => ({
  id: crypto.randomUUID(),
  promptText: '',
  answersText: '',
  youtubeUrl: '',
  youtubeDurationSeconds: null,
  startTime: '00:00:00',
  endTime: '00:00:30',
  imageFile: null,
  imageUrl: null,
  imageCropSettings: { x: 50, y: 50, zoom: 1 },
});

const MAX_YOUTUBE_CLIP_SECONDS = 90;
const MAX_MAP_QUESTIONS = 300;

export function MapEditorPage() {
  const runOnce = useSingleFlight();
  const navigate = useNavigate();
  const location = useLocation();
  const { mapId } = useParams();
  const editorMapId = mapId ? Number(mapId) : null;
  const [step, setStep] = useState<1 | 2>(() => {
    const navigationStep = (location.state as EditorNavigationState | null)?.editorStep;
    return navigationStep === 2 ? 2 : 1;
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(CATEGORY_OPTIONS[0]?.categoryId ?? 1);
  const [questionType, setQuestionType] = useState<QuestionType>('AUDIO');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE' | 'UNLISTED'>('PUBLIC');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailAssetId, setThumbnailAssetId] = useState<number | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailCropSettings, setThumbnailCropSettings] = useState<CropSettings>({ x: 50, y: 50, zoom: 1 });
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<number[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<LocalQuestion | null>(null);
  const [pendingQuestionType, setPendingQuestionType] = useState<QuestionType | null>(null);
  const [initialEditorSnapshot, setInitialEditorSnapshot] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [draftSavedModalOpen, setDraftSavedModalOpen] = useState(
    () => Boolean((location.state as EditorNavigationState | null)?.draftSaved),
  );
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; questions?: string }>({});
  const [unresolvedSourceQuestionIds, setUnresolvedSourceQuestionIds] = useState<string[]>([]);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const questionListRef = useRef<HTMLDivElement | null>(null);
  const initializedMapIdRef = useRef<number | null>(null);
  const allowNavigationRef = useRef(false);

  const editorQuery = useQuery({
    queryKey: queryKeys.mapEditor(editorMapId ?? 0),
    queryFn: () => mapApi.editor(editorMapId ?? 0),
    enabled: Boolean(editorMapId),
    refetchInterval: (query) => (hasActiveEditorAudioProcessing(query.state.data) ? 5000 : false),
  });

  useEffect(() => {
    if (!editorQuery.data) return;
    const editor = editorQuery.data;
    if (initializedMapIdRef.current === editor.mapId) {
      if (editor.status === 'DRAFT') return;
      setQuestions((current) => mergeQuestionProcessingState(current, editor.questions));
      setEditingQuestion((current) => (current ? mergeQuestionProcessingState([current], editor.questions)[0] : null));
      return;
    }
    initializedMapIdRef.current = editor.mapId;
    const loadedTitle = editor.title ?? '';
    const loadedDescription = editor.description ?? '';
    const loadedCategoryId = editor.categoryId ?? CATEGORY_OPTIONS[0]?.categoryId ?? 1;
    const loadedQuestionType = editor.questionType ?? 'AUDIO';
    const loadedVisibility = editor.visibility === 'UNLISTED' ? 'PRIVATE' : editor.visibility;
    const showAudioProcessingState = editor.status !== 'DRAFT';
    const loadedQuestions: LocalQuestion[] = editor.questions.map((question) => ({
      id: String(question.questionId),
      questionId: question.questionId,
      promptText: question.promptText,
      answersText: question.answers.join(', '),
      youtubeUrl: question.media?.sourceUrl ?? '',
      youtubeDurationSeconds: null,
      startTime: msToTime(question.media?.startTimeMs ?? 0),
      endTime: msToTime(question.media?.endTimeMs ?? 30000),
      imageFile: null,
      imageAssetId: question.media?.assetId ?? undefined,
      imageUrl: question.media?.assetUrl ?? null,
      imageCropSettings: { x: 50, y: 50, zoom: 1 },
      processingStatus: showAudioProcessingState ? question.media?.processingStatus : undefined,
      failureCode: showAudioProcessingState ? question.media?.failureCode : undefined,
      failureType: showAudioProcessingState ? question.media?.failureType : undefined,
      failureMessage: showAudioProcessingState ? question.media?.failureMessage : undefined,
      canRetry: showAudioProcessingState ? question.media?.canRetry : undefined,
      sourceFailureResolved: false,
    }));
    setTitle(loadedTitle);
    setDescription(loadedDescription);
    setCategoryId(loadedCategoryId);
    setQuestionType(loadedQuestionType);
    setVisibility(loadedVisibility);
    setThumbnailAssetId(editor.thumbnailAssetId);
    setThumbnailUrl(editor.thumbnailUrl);
    setQuestions(loadedQuestions);
    setInitialEditorSnapshot(
      editorSnapshot({
        title: loadedTitle,
        description: loadedDescription,
        categoryId: loadedCategoryId,
        questionType: loadedQuestionType,
        visibility: loadedVisibility,
        thumbnailAssetId: editor.thumbnailAssetId,
        thumbnailUrl: editor.thumbnailUrl,
        thumbnailFile: null,
        thumbnailCropSettings: { x: 50, y: 50, zoom: 1 },
        questions: loadedQuestions,
        deletedQuestionIds: [],
      }),
    );
    allowNavigationRef.current = false;
  }, [editorQuery.data]);

  useEffect(() => {
    const state = location.state as EditorNavigationState | null;
    if (!state?.draftSaved) return;
    if (state.editorStep) setStep(state.editorStep);
    setDraftSavedModalOpen(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!editorQuery.isError) return;
    navigate('/me/maps', { replace: true });
  }, [editorQuery.isError, navigate]);

  const saveMutation = useMutation({
    mutationFn: async (draft: boolean) => {
      setFormError('');
      const validationError = validateBeforeSave(draft);
      if (validationError) throw new Error(`form:${validationError}`);

      let nextThumbnailAssetId = thumbnailAssetId;
      if (thumbnailFile) {
        const cropped = await cropImageToBlob(thumbnailFile, 16 / 9, thumbnailCropSettings);
        const uploaded = await assetApi.uploadImage(cropped, 'map-thumbnail.webp', 'MAP_THUMBNAIL');
        nextThumbnailAssetId = uploaded.assetId;
      }

      const builtQuestions: BuiltQuestion[] = await Promise.all(
        questions.map(async (question) => {
          const answers = draft ? splitAnswers(question.answersText) : splitAnswersStrict(question.answersText);

          if (questionType === 'TEXT') return { promptText: question.promptText.trim(), media: null, answers };

          if (questionType === 'IMAGE') {
            let assetId: number | undefined;
            if (question.imageFile) {
              const cropped = await cropImageToBlob(question.imageFile, 16 / 9, question.imageCropSettings);
              const uploaded = await assetApi.uploadImage(cropped, 'question-image.webp', 'QUESTION_IMAGE');
              assetId = uploaded.assetId;
            }
            return {
              promptText: question.promptText.trim(),
              media: assetId
                ? { sourceType: 'UPLOAD' as const, assetId }
                : question.imageAssetId
                  ? { sourceType: 'UPLOAD' as const, assetId: question.imageAssetId }
                  : null,
              answers,
            };
          }

          const sourceUrl = question.youtubeUrl.trim();
          return {
            promptText: question.promptText.trim(),
            media: sourceUrl
              ? {
                  sourceType: 'YOUTUBE' as const,
                  sourceUrl,
                  startTimeMs: timeToMs(question.startTime),
                  endTimeMs: timeToMs(question.endTime),
                }
              : null,
            answers,
          };
        }),
      );
      const questionPairs = questions.map((question, index) => ({ local: question, built: builtQuestions[index] }));

      if (editorMapId && editorQuery.data && draft) {
        return mapApi.updateDraft(editorMapId, {
          version: editorQuery.data.version,
          title: title.trim() || undefined,
          categoryId,
          questionType,
          thumbnailAssetId: nextThumbnailAssetId,
          description: cleanDescription(description),
          visibility,
          questions: questionPairs.map((pair) => ({
            questionId: pair.local.questionId,
            clientId: pair.local.id,
            ...pair.built,
          })),
        });
      }

      if (editorMapId && editorQuery.data) {
        const originalQuestionsById = new Map(editorQuery.data.questions.map((question) => [question.questionId, question]));
        return mapApi.update(editorMapId, {
          version: editorQuery.data.version,
          map: { title: title.trim(), categoryId, questionType, thumbnailAssetId: nextThumbnailAssetId, description: cleanDescription(description), visibility },
          questions: {
            create: questionPairs
              .filter((pair) => !pair.local.questionId)
              .map((pair) => ({ ...pair.built, clientId: pair.local.id })),
            update: questionPairs
              .filter((pair) => {
                if (!pair.local.questionId) return false;
                const original = originalQuestionsById.get(pair.local.questionId);
                return !original || isQuestionChanged(pair.local, pair.built, original, questionType);
              })
              .map((pair) => ({ ...pair.built, questionId: pair.local.questionId })),
            delete: deletedQuestionIds,
          },
        });
      }

      if (draft) {
        return mapApi.saveDraft({
          title: title.trim() || undefined,
          categoryId,
          questionType,
          thumbnailAssetId: nextThumbnailAssetId,
          description: cleanDescription(description),
          visibility,
          questions: builtQuestions,
        });
      }

      return mapApi.create({
        title: title.trim(),
        categoryId,
        questionType,
        thumbnailAssetId: nextThumbnailAssetId,
        description: cleanDescription(description),
        visibility,
        questions: builtQuestions,
      });
    },
    onError: (error) => {
      if (error instanceof Error && error.message.startsWith('form:')) {
        return;
      }
    },
    onSuccess: async (_response, draft) => {
      if (editorMapId && draft) {
        initializedMapIdRef.current = null;
        await editorQuery.refetch();
        setDraftSavedModalOpen(true);
        return;
      }
      if (draft) {
        allowNavigationRef.current = true;
        navigate(`/maps/${_response.mapId}/edit`, {
          replace: true,
          state: { draftSaved: true, editorStep: step } satisfies EditorNavigationState,
        });
        return;
      }
      allowNavigationRef.current = true;
      navigate('/me/maps');
    },
  });

  const validateBasic = () => {
    const error = getBasicError(title, categoryId);
    if (error) {
      setStep(1);
      setFieldErrors({ title: error });
      window.setTimeout(() => titleRef.current?.focus(), 0);
      return false;
    }
    setFieldErrors((current) => ({ ...current, title: undefined }));
    return true;
  };

  const validateBeforeSave = (draft: boolean) => {
    if (draft) return '';
    const basicError = getBasicError(title, categoryId);
    if (basicError) {
      setStep(1);
      setFieldErrors({ title: basicError });
      window.setTimeout(() => titleRef.current?.focus(), 0);
      return basicError;
    }
    if (questions.length < 1) {
      setStep(2);
      setFieldErrors({ questions: '문제를 1개 이상 추가해주세요.' });
      window.setTimeout(() => questionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return '문제를 1개 이상 추가해주세요.';
    }
    if (questions.length > MAX_MAP_QUESTIONS) {
      setStep(2);
      setFieldErrors({ questions: `문제는 최대 ${MAX_MAP_QUESTIONS}개까지 만들 수 있습니다.` });
      window.setTimeout(() => questionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return `문제는 최대 ${MAX_MAP_QUESTIONS}개까지 만들 수 있습니다.`;
    }

    for (const [index, question] of questions.entries()) {
      const questionError = getQuestionError(question, questionType);
      if (questionError) {
        setStep(2);
        setEditingQuestion({ ...question });
        setFieldErrors({ questions: `문제 ${index + 1}을 확인해주세요. ${questionError}` });
        return `문제 ${index + 1}: ${questionError}`;
      }
    }

    const unresolvedSourceFailures = questions.filter(
      (question) => question.processingStatus === 'FAILED' && question.failureType === 'SOURCE' && !question.sourceFailureResolved,
    );
    if (unresolvedSourceFailures.length > 0) {
      setStep(2);
      setUnresolvedSourceQuestionIds(unresolvedSourceFailures.map((question) => question.id));
      return '영상 오류 문제를 수정하거나 삭제해주세요.';
    }

    setFieldErrors({});
    return '';
  };
  const showSaveError = saveMutation.isError && !(saveMutation.error instanceof Error && saveMutation.error.message.startsWith('form:'));
  const hasEditorDraft = Boolean(
    title.trim() ||
      description.trim() ||
      thumbnailFile ||
      thumbnailUrl ||
      thumbnailAssetId ||
      questions.length ||
      deletedQuestionIds.length,
  );
  const currentEditorSnapshot = useMemo(
    () =>
      editorSnapshot({
        title,
        description,
        categoryId,
        questionType,
        visibility,
        thumbnailAssetId,
        thumbnailUrl,
        thumbnailFile,
        thumbnailCropSettings,
        questions,
        deletedQuestionIds,
      }),
    [
      categoryId,
      deletedQuestionIds,
      description,
      questionType,
      questions,
      thumbnailAssetId,
      thumbnailCropSettings,
      thumbnailFile,
      thumbnailUrl,
      title,
      visibility,
    ],
  );
  const hasUnsavedChanges = editorMapId
    ? initialEditorSnapshot !== null && currentEditorSnapshot !== initialEditorSnapshot
    : hasEditorDraft;
  const navigationBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigationRef.current &&
      hasUnsavedChanges &&
      `${currentLocation.pathname}${currentLocation.search}` !== `${nextLocation.pathname}${nextLocation.search}`,
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);
  const applyQuestionType = (nextType: QuestionType) => {
    setQuestionType(nextType);
    setQuestions([]);
    setDeletedQuestionIds(editorQuery.data?.questions.map((question) => question.questionId) ?? []);
    setPendingQuestionType(null);
  };
  const audioProcessing = summarizeEditorAudioProcessing(questions);

  if (editorQuery.isError) return null;

  return (
    <section className={styles.shell}>
      <PageHeader title={editorMapId ? '맵 수정' : '맵 제작'} />
      {(formError || showSaveError) && <Alert tone="danger">{formError || mapSaveErrorMessage(toApiErrorMessage(saveMutation.error))}</Alert>}

      <div className={styles.stepBar}>
        <button className={step === 1 ? styles.stepActive : ''} type="button" onClick={() => setStep(1)}>
          1. 기본 정보
        </button>
        <button
          className={step === 2 ? styles.stepActive : ''}
          type="button"
          onClick={() => {
            if (validateBasic()) setStep(2);
          }}
        >
          2. 문제 구성
        </button>
      </div>

      {step === 1 ? (
        <Panel className={styles.basicPanel}>
          <div className={styles.editorForm}>
            <FormField
              label="맵 제목"
              required
              errorText={fieldErrors.title}
              counterText={remainingText(title, 40)}
              tooltipText="맵 목록과 방 생성 화면에 보이는 이름입니다. 어떤 문제인지 바로 떠오르게 적어주세요."
            >
              <input
                ref={titleRef}
                maxLength={40}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setFieldErrors((current) => ({ ...current, title: undefined }));
                }}
                placeholder="예: 2010년대 댄스곡 맞히기"
              />
            </FormField>
            <div className={styles.row}>
              <FormField label="카테고리" required tooltipText="맵을 찾을 때 쓰이는 분류입니다. 가장 가까운 주제를 선택해주세요.">
                <select value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category.categoryId} value={category.categoryId}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="문제 유형"
                required
                tooltipText="오디오는 YouTube 구간을 들려주고, 이미지는 업로드한 이미지를 보여주며, 텍스트는 지문만으로 진행됩니다. 유형을 바꾸면 기존 문제 목록이 초기화됩니다."
              >
                <select
                  value={questionType}
                  onChange={(event) => {
                    const nextType = event.target.value as QuestionType;
                    if (nextType === questionType) return;
                    if (questions.length > 0) {
                      setPendingQuestionType(nextType);
                      return;
                    }
                    applyQuestionType(nextType);
                  }}
                >
                  <option value="AUDIO">오디오</option>
                  <option value="TEXT">텍스트</option>
                  <option value="IMAGE">이미지</option>
                </select>
              </FormField>
            </div>
            <FormField label="공개 범위" tooltipText="공개는 맵 목록에 노출됩니다. 비공개는 제작자만 볼 수 있습니다.">
              <select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}>
                <option value="PUBLIC">공개</option>
                <option value="PRIVATE">비공개</option>
              </select>
            </FormField>
            <FormField label="썸네일" tooltipText="맵 목록과 방 화면에 표시되는 대표 이미지입니다. 선택 후 영역을 조정할 수 있습니다.">
              <ImageCropPicker
                aspectRatio={16 / 9}
                defaultFit="contain"
                file={thumbnailFile}
                imageUrl={thumbnailUrl}
                label="맵 썸네일"
                settings={thumbnailCropSettings}
                onFileChange={(file) => {
                  setThumbnailFile(file);
                  if (file) setThumbnailUrl(null);
                }}
                onExistingImageClear={() => {
                  setThumbnailAssetId(null);
                  setThumbnailUrl(null);
                }}
                onSettingsChange={setThumbnailCropSettings}
              />
            </FormField>
            <FormField
              label="맵 설명"
              counterText={remainingText(description, 500)}
              tooltipText="어떤 주제의 퀴즈인지, 플레이 전에 알면 좋은 내용을 적어주세요."
            >
              <textarea
                rows={4}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => navigate('/maps')}>
                취소
              </Button>
              <Button
                onClick={() => {
                  if (validateBasic()) setStep(2);
                }}
              >
                다음 단계로
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <div className={styles.questionWorkspace}>
          <div className={styles.questionHeader} ref={questionListRef}>
            <div>
              <h2>문제 리스트</h2>
              <p>{questions.length}/{MAX_MAP_QUESTIONS}개의 문제가 등록되었습니다.</p>
              {fieldErrors.questions && <span className={styles.inlineError}>{fieldErrors.questions}</span>}
            </div>
          </div>
          {questionType === 'AUDIO' && audioProcessing.failedCount > 0 ? (
            <div className={styles.editorAudioProcessing}>
              {audioProcessing.unresolvedSourceFailureCount > 0 && (
                <Alert tone="danger">
                  영상 오류 {audioProcessing.unresolvedSourceFailureCount}개를 수정하거나 삭제한 뒤 맵을 저장해주세요.
                </Alert>
              )}
              {audioProcessing.resolvedSourceFailureCount > 0 && (
                <Alert tone="success">
                  영상 오류 {audioProcessing.resolvedSourceFailureCount}개가 수정되었습니다. 맵을 저장하면 새 오디오 처리
                  {audioProcessing.serverFailureCount > 0 ? '와 서버 오류 재시도' : ''}가 시작됩니다.
                </Alert>
              )}
              {audioProcessing.serverFailureCount > 0 && (
                <Alert>
                  서버 오류 {audioProcessing.serverFailureCount}개가 남아 있습니다.{' '}
                  {audioProcessing.sourceFailureCount > 0
                    ? '영상 오류를 모두 수정하거나 삭제해 저장하면 서버 오류도 함께 다시 처리합니다.'
                    : '재시도는 내가 만든 맵에서 할 수 있습니다.'}
                </Alert>
              )}
            </div>
          ) : questionType === 'AUDIO' && audioProcessing.totalCount > 0 && audioProcessing.readyCount < audioProcessing.totalCount ? (
            <div className={styles.editorAudioProcessing}>
              <div className={styles.editorAudioProgressHeader}>
                <div>
                  <strong>오디오 처리 {audioProcessing.readyCount}/{audioProcessing.totalCount}</strong>
                  <span>{editorAudioSummaryText(audioProcessing)}</span>
                </div>
              </div>
              <progress
                className={styles.audioProgress}
                max={audioProcessing.totalCount}
                value={audioProcessing.readyCount}
                aria-label={`오디오 처리 ${audioProcessing.readyCount}/${audioProcessing.totalCount}`}
              />
            </div>
          ) : null}
          <div className={styles.questionGrid}>
            {questions.map((question, index) => (
              <button className={styles.questionCard} key={question.id} type="button" onClick={() => setEditingQuestion({ ...question })}>
                <span className={styles.questionNumber}>{index + 1}</span>
                <QuestionPreview question={question} questionType={questionType} />
                {questionType === 'AUDIO' && question.processingStatus && question.processingStatus !== 'READY' && (
                  <QuestionProcessingBadge question={question} />
                )}
                <strong>{question.promptText || '문제 지문 미입력'}</strong>
                <span>{splitAnswers(question.answersText).join(', ') || '정답 미입력'}</span>
              </button>
            ))}
            <button
              className={styles.addQuestionCard}
              type="button"
              disabled={questions.length >= MAX_MAP_QUESTIONS}
              onClick={() => {
                if (questions.length >= MAX_MAP_QUESTIONS) {
                  setFieldErrors((current) => ({ ...current, questions: `문제는 최대 ${MAX_MAP_QUESTIONS}개까지 만들 수 있습니다.` }));
                  return;
                }
                setEditingQuestion(emptyQuestion());
              }}
            >
              <Plus size={34} />
              <span>새 문제 추가</span>
            </button>
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setStep(1)}>
              이전 단계로
            </Button>
            {(!editorMapId || editorQuery.data?.status === 'DRAFT') && (
              <Button variant="secondary" icon={<Save size={17} />} onClick={() => runOnce('map-save', () => saveMutation.mutateAsync(true))} disabled={saveMutation.isPending}>
                임시저장
              </Button>
            )}
            <Button icon={<Save size={17} />} onClick={() => runOnce('map-save', () => saveMutation.mutateAsync(false))} disabled={saveMutation.isPending}>
              맵 저장
            </Button>
          </div>
        </div>
      )}

      <QuestionModal
        open={Boolean(editingQuestion)}
        question={editingQuestion}
        questionType={questionType}
        onClose={() => setEditingQuestion(null)}
        onDelete={(question) => {
          if (question.questionId) setDeletedQuestionIds((current) => [...current, question.questionId!]);
          setQuestions((current) => current.filter((item) => item.id !== question.id));
          setEditingQuestion(null);
        }}
        onSave={(question) => {
          setQuestions((current) => {
            const exists = current.some((item) => item.id === question.id);
            if (!exists && current.length >= MAX_MAP_QUESTIONS) return current;
            const original = question.questionId
              ? editorQuery.data?.questions.find((item) => item.questionId === question.questionId)
              : undefined;
            const nextQuestion = {
              ...question,
              sourceFailureResolved: resolvesSourceFailure(question, original),
            };
            return exists ? current.map((item) => (item.id === question.id ? nextQuestion : item)) : [...current, nextQuestion];
          });
          setEditingQuestion(null);
        }}
      />
      <Modal
        open={unresolvedSourceQuestionIds.length > 0}
        title="영상 오류 문제를 확인해주세요"
        onClose={() => setUnresolvedSourceQuestionIds([])}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnresolvedSourceQuestionIds([])}>
              닫기
            </Button>
            <Button
              onClick={() => {
                const firstQuestion = questions.find((question) => question.id === unresolvedSourceQuestionIds[0]);
                setUnresolvedSourceQuestionIds([]);
                if (firstQuestion) setEditingQuestion({ ...firstQuestion });
              }}
            >
              첫 문제 수정
            </Button>
          </>
        }
      >
        <p className="muted">
          영상 오류가 남은 문제는 그대로 저장할 수 없습니다. 공개 영상 링크로 변경하거나, 재생 범위 오류라면 링크 또는 시작·종료 범위를 수정해주세요. 사용하지 않을 문제는 삭제할 수 있습니다.
        </p>
        <p className="muted">
          확인이 필요한 문제: {unresolvedSourceQuestionIds.map((id) => questions.findIndex((question) => question.id === id) + 1).join(', ')}번
        </p>
      </Modal>
      <Modal
        open={navigationBlocker.state === 'blocked'}
        title={editorMapId ? '맵 수정 나가기' : '맵 제작 나가기'}
        onClose={() => navigationBlocker.reset?.()}
        footer={
          <>
            <Button variant="secondary" onClick={() => navigationBlocker.reset?.()}>
              계속 작성
            </Button>
            <Button variant="danger" onClick={() => navigationBlocker.proceed?.()}>
              나가기
            </Button>
          </>
        }
      >
        <p className="muted">저장하지 않은 맵 정보와 문제는 사라집니다.{'\n'}작성을 그만하고 나갈까요?</p>
      </Modal>

      <Modal
        open={draftSavedModalOpen}
        title="임시저장"
        onClose={() => setDraftSavedModalOpen(false)}
        footer={<Button onClick={() => setDraftSavedModalOpen(false)}>확인</Button>}
      >
        <p>임시저장되었습니다.</p>
      </Modal>

      <Modal
        open={Boolean(pendingQuestionType)}
        title="문제 유형 변경"
        onClose={() => setPendingQuestionType(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingQuestionType(null)}>
              취소
            </Button>
            <Button variant="danger" onClick={() => pendingQuestionType && applyQuestionType(pendingQuestionType)}>
              변경하고 문제 삭제
            </Button>
          </>
        }
      >
        <p className="muted">문제 유형을 변경하면 지금 추가한 문제들이 모두 삭제됩니다. 계속 진행할까요?</p>
      </Modal>
    </section>
  );
}

function QuestionProcessingBadge({ question }: { question: LocalQuestion }) {
  const status = question.processingStatus;
  if (!status || status === 'READY') return null;
  if (question.sourceFailureResolved) {
    return <span className={`${styles.questionProcessingBadge} ${styles.questionProcessingBadgeSuccess}`}>영상 수정됨 · 저장 필요</span>;
  }
  const tone = status === 'FAILED' ? 'Danger' : status === 'RETRYING' ? 'Warning' : 'Active';
  return <span className={`${styles.questionProcessingBadge} ${styles[`questionProcessingBadge${tone}`]}`}>{questionProcessingLabel(question)}</span>;
}

function QuestionModal({
  open,
  question,
  questionType,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  question: LocalQuestion | null;
  questionType: QuestionType;
  onClose: () => void;
  onSave: (question: LocalQuestion) => void;
  onDelete: (question: LocalQuestion) => void;
}) {
  const [draft, setDraft] = useState<LocalQuestion>(question ?? emptyQuestion());
  const [questionErrors, setQuestionErrors] = useState<Partial<Record<QuestionErrorField, string>>>({});
  const [answerInput, setAnswerInput] = useState('');
  const [draggingAnswerIndex, setDraggingAnswerIndex] = useState<number | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [youtubeDurationSeconds, setYoutubeDurationSeconds] = useState<number | null>(null);
  const promptRef = useRef<HTMLInputElement | null>(null);
  const youtubeRef = useRef<HTMLInputElement | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endTimeRef = useRef<HTMLInputElement | null>(null);
  const answerRef = useRef<HTMLInputElement | null>(null);
  const imageFieldRef = useRef<HTMLDivElement | null>(null);
  const youtubeId = getYoutubeId(draft.youtubeUrl);
  const answers = splitAnswers(draft.answersText);
  const hasQuestionDraft = isQuestionDirty(draft, question);
  const closeQuestion = () => {
    if (hasQuestionDraft) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    setDraft(question ?? emptyQuestion());
    setQuestionErrors({});
    setAnswerInput('');
    setYoutubeDurationSeconds(null);
  }, [question?.id]);

  useEffect(() => {
    if (!question) return;
    setDraft((current) => ({
      ...current,
      processingStatus: question.processingStatus,
      failureCode: question.failureCode,
      failureType: question.failureType,
      failureMessage: question.failureMessage,
      canRetry: question.canRetry,
      sourceFailureResolved: question.sourceFailureResolved,
    }));
  }, [question?.canRetry, question?.failureCode, question?.failureMessage, question?.failureType, question?.processingStatus, question?.sourceFailureResolved]);

  const setAnswerList = (nextAnswers: string[]) => {
    setDraft((current) => ({ ...current, answersText: nextAnswers.join(', ') }));
  };

  const addAnswer = () => {
    const nextAnswer = answerInput.trim();
    if (!nextAnswer || answers.length >= 20) return;
    if (nextAnswer.length > 50) {
      setQuestionErrors((current) => ({ ...current, answers: '정답은 각각 50자 이하로 입력해주세요.' }));
      return;
    }
    const duplicateInView = answers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(nextAnswer));
    setDraft((current) => {
      const currentAnswers = splitAnswers(current.answersText);
      if (currentAnswers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(nextAnswer))) return current;
      return { ...current, answersText: [...currentAnswers, nextAnswer].join(', ') };
    });
    if (duplicateInView) {
      setQuestionErrors((current) => ({ ...current, answers: '이미 등록된 정답입니다.' }));
      return;
    }
    setAnswerInput('');
    setQuestionErrors((current) => ({ ...current, answers: undefined }));
  };

  const removeAnswer = (index: number) => {
    setAnswerList(answers.filter((_, answerIndex) => answerIndex !== index));
  };

  const moveAnswer = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const nextAnswers = [...answers];
    const [movedAnswer] = nextAnswers.splice(fromIndex, 1);
    nextAnswers.splice(toIndex, 0, movedAnswer);
    setAnswerList(nextAnswers);
  };

  const handleConfirm = () => {
    const validation = getQuestionValidation(draft, questionType, youtubeDurationSeconds ?? draft.youtubeDurationSeconds);
    if (validation) {
      setQuestionErrors({ [validation.field]: validation.message });
      focusQuestionField(validation.field, {
        prompt: promptRef.current,
        youtube: youtubeRef.current,
        startTime: startTimeRef.current,
        endTime: endTimeRef.current,
        answers: answerRef.current,
        image: imageFieldRef.current,
      });
      return;
    }
    setQuestionErrors({});
    onSave(draft);
  };

  return (
    <Modal
      open={open}
      title="문제 상세 설정"
      width={720}
      onClose={closeQuestion}
      footer={
        <>
          {question && (
            <Button icon={<Trash2 size={17} />} variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
              삭제
            </Button>
          )}
          <Button variant="secondary" onClick={closeQuestion}>
            취소
          </Button>
          <Button onClick={handleConfirm}>확인</Button>
        </>
      }
    >
      <div className={styles.editorForm}>
        {questionType === 'AUDIO' && draft.processingStatus && <QuestionProcessingNotice question={draft} />}
        <FormField
          label="문제 지문"
          errorText={questionErrors.prompt}
          counterText={remainingText(draft.promptText, 200)}
          tooltipText="플레이어에게 보이는 문제 문장입니다. 오디오/이미지 문제에서도 추가 힌트처럼 사용할 수 있습니다."
        >
          <input
            ref={promptRef}
            maxLength={200}
            value={draft.promptText}
            onChange={(event) => {
              setDraft({ ...draft, promptText: event.target.value });
              setQuestionErrors((current) => ({ ...current, prompt: undefined }));
            }}
          />
        </FormField>
        {questionType === 'AUDIO' && (
          <>
            <FormField
              label="YouTube 영상 링크"
              helperText={questionErrors.youtube ? undefined : '공개 상태의 영상만 사용할 수 있습니다. watch, youtu.be, shorts 링크를 지원합니다.'}
              errorText={questionErrors.youtube}
              counterText={remainingText(draft.youtubeUrl, 2048)}
              tooltipText="오디오 문제의 원본 영상입니다. 시작/종료 지점을 지정하면 해당 구간만 문제로 사용합니다."
            >
              <input
                ref={youtubeRef}
                maxLength={2048}
                placeholder="https://www.youtube.com/watch?v=..."
                value={draft.youtubeUrl}
                onChange={(event) => {
                  setDraft({ ...draft, youtubeUrl: event.target.value });
                  setQuestionErrors((current) => ({ ...current, youtube: undefined }));
                }}
              />
            </FormField>
            <YoutubeClipPlayer
              videoId={youtubeId}
              startSeconds={Math.floor(timeToMs(draft.startTime) / 1000)}
              onDurationChange={(seconds) => {
                setYoutubeDurationSeconds(seconds);
                setDraft((current) => ({ ...current, youtubeDurationSeconds: seconds }));
              }}
              onPickEnd={(endTime) => setDraft({ ...draft, endTime })}
              onPickStart={(startTime) => setDraft({ ...draft, startTime })}
            />
            <div className={styles.row}>
              <TimeField
                inputRef={startTimeRef}
                label="시작 시간"
                value={draft.startTime}
                errorText={questionErrors.startTime}
                onChange={(startTime) => {
                  setDraft({ ...draft, startTime });
                  setQuestionErrors((current) => ({ ...current, startTime: undefined, endTime: undefined }));
                }}
              />
              <TimeField
                inputRef={endTimeRef}
                label="종료 시간"
                value={draft.endTime}
                errorText={questionErrors.endTime}
                onChange={(endTime) => {
                  setDraft({ ...draft, endTime });
                  setQuestionErrors((current) => ({ ...current, endTime: undefined }));
                }}
              />
            </div>
          </>
        )}
        {questionType === 'IMAGE' && (
          <div ref={imageFieldRef}>
            <FormField
              label="문제 이미지"
              errorText={questionErrors.image}
              tooltipText="문제로 보여줄 이미지입니다. 파일을 선택하면 보여줄 영역을 잘라서 저장합니다."
            >
              <ImageCropPicker
                aspectRatio={16 / 9}
                defaultFit="contain"
                file={draft.imageFile}
                imageUrl={draft.imageUrl}
                label="문제 이미지"
                settings={draft.imageCropSettings}
                onFileChange={(imageFile) => {
                  setDraft((current) => ({
                    ...current,
                    imageFile,
                    imageAssetId: imageFile ? undefined : current.imageAssetId,
                    imageUrl: imageFile ? null : current.imageUrl,
                  }));
                  setQuestionErrors((current) => ({ ...current, image: undefined }));
                }}
                onExistingImageClear={() =>
                  setDraft((current) => ({ ...current, imageFile: null, imageAssetId: undefined, imageUrl: null }))
                }
                onSettingsChange={(imageCropSettings) => setDraft((current) => ({ ...current, imageCropSettings }))}
              />
            </FormField>
          </div>
        )}
        {questionType === 'TEXT' && (
          <div className={styles.typeNote}>
            <ImagePlus size={17} />
            <span>텍스트 문제는 미디어 없이 지문과 정답만 저장됩니다.</span>
          </div>
        )}
        <FormField
          label="정답"
          helperText={questionErrors.answers ? undefined : `등록된 정답 ${answers.length} / 20`}
          errorText={questionErrors.answers}
          counterText={remainingText(answerInput, 50)}
          tooltipText="정답 후보를 여러 개 추가할 수 있습니다. 맨 앞 정답이 대표 정답으로 표시되며, 드래그하거나 클릭해 순서를 바꿀 수 있습니다."
        >
          <div className={styles.answerEditor}>
            <div className={styles.answerInputRow}>
              <input
                ref={answerRef}
                maxLength={50}
                value={answerInput}
                onChange={(event) => {
                  setAnswerInput(event.target.value);
                  setQuestionErrors((current) => ({ ...current, answers: undefined }));
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const nativeEvent = event.nativeEvent as ReactKeyboardEvent<HTMLInputElement>['nativeEvent'] & {
                    isComposing?: boolean;
                    keyCode?: number;
                  };
                  if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
                  event.preventDefault();
                  event.stopPropagation();
                  addAnswer();
                }}
                placeholder="정답 입력 후 Enter"
                disabled={answers.length >= 20}
              />
              <Button icon={<Plus size={17} />} variant="secondary" onClick={addAnswer} disabled={answers.length >= 20 || !answerInput.trim()}>
                추가
              </Button>
            </div>
            <div className={styles.answerChips}>
              {answers.map((answer, index) => (
                <div
                  className={`${styles.answerChip} ${index === 0 ? styles.primaryAnswer : ''}`}
                  draggable
                  key={`${answer}-${index}`}
                  onDragStart={() => setDraggingAnswerIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggingAnswerIndex !== null) moveAnswer(draggingAnswerIndex, index);
                    setDraggingAnswerIndex(null);
                  }}
                >
                  <button type="button" title={index === 0 ? '대표 정답' : '대표 정답으로 변경'} onClick={() => moveAnswer(index, 0)}>
                    {answer}
                  </button>
                  <button type="button" aria-label={`${answer} 삭제`} onClick={() => removeAnswer(index)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </FormField>
      </div>
      <Modal
        open={closeConfirmOpen}
        title="문제 작성 취소"
        onClose={() => setCloseConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseConfirmOpen(false)}>
              계속 작성
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setCloseConfirmOpen(false);
                onClose();
              }}
            >
              닫기
            </Button>
          </>
        }
      >
        <p className="muted">저장하지 않은 문제 내용은 사라집니다.{'\n'}문제 작성을 닫을까요?</p>
      </Modal>
      <Modal
        open={deleteConfirmOpen}
        title="문제 삭제"
        onClose={() => setDeleteConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
              취소
            </Button>
            <Button
              icon={<Trash2 size={17} />}
              variant="danger"
              onClick={() => {
                setDeleteConfirmOpen(false);
                onDelete(draft);
              }}
            >
              삭제
            </Button>
          </>
        }
      >
        <p className="muted">이 문제를 삭제합니다.{'\n'}삭제한 문제는 맵 저장 시 반영됩니다.</p>
      </Modal>
    </Modal>
  );
}

function QuestionProcessingNotice({ question }: { question: LocalQuestion }) {
  if (question.sourceFailureResolved) {
    return <Alert tone="success">영상 정보가 수정되었습니다. 문제 확인 후 맵을 저장하면 오디오를 다시 처리합니다.</Alert>;
  }
  if (question.processingStatus === 'FAILED') {
    const guidance = audioFailureGuidance(question);
    return (
      <Alert tone="danger">
        <strong>{question.failureMessage || failureTitle(question)}</strong>
        <br />
        {guidance}
      </Alert>
    );
  }

  if (question.processingStatus === 'READY') return null;
  return (
    <div className={styles.processingNotice}>
      <RefreshCw size={16} />
      <span>{questionProcessingLabel(question)}입니다. 이 창을 닫아도 처리는 계속됩니다.</span>
    </div>
  );
}

function YoutubeClipPlayer({
  videoId,
  startSeconds,
  onDurationChange,
  onPickStart,
  onPickEnd,
}: {
  videoId: string | null;
  startSeconds: number;
  onDurationChange: (seconds: number | null) => void;
  onPickStart: (value: string) => void;
  onPickEnd: (value: string) => void;
}) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YoutubePlayerHandle | null>(null);
  const initialStartRef = useRef(startSeconds);
  const onDurationChangeRef = useRef(onDurationChange);

  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  useEffect(() => {
    let cancelled = false;
    if (!videoId) {
      playerRef.current?.destroy();
      playerRef.current = null;
      onDurationChangeRef.current(null);
      return;
    }

    initialStartRef.current = startSeconds;
    loadYoutubeApi().then((YT) => {
      if (cancelled || !playerHostRef.current) return;
      playerRef.current?.destroy();
      playerRef.current = new YT.Player(playerHostRef.current, {
        videoId,
        playerVars: {
          rel: 0,
          start: initialStartRef.current,
        },
        events: {
          onReady: (event) => {
            const duration = Math.floor(event.target.getDuration?.() ?? 0);
            onDurationChangeRef.current(duration > 0 ? duration : null);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  const pickCurrentTime = (setter: (value: string) => void) => {
    if (!videoId) return;
    const seconds = Math.floor(playerRef.current?.getCurrentTime() ?? startSeconds);
    setter(msToTime(seconds * 1000));
  };

  return (
    <div className={styles.youtubePicker}>
      <div className={videoId ? styles.youtubeFrame : styles.youtubeEmpty}>
        {videoId ? (
          <div ref={playerHostRef} />
        ) : (
          <>
            <Play size={22} />
            <span>링크를 입력하면 영상이 활성화됩니다.</span>
          </>
        )}
      </div>
      <div className={styles.pickBar}>
        <Button size="sm" variant="secondary" onClick={() => pickCurrentTime(onPickStart)} disabled={!videoId}>
          시작 지점 지정
        </Button>
        <Button size="sm" variant="secondary" onClick={() => pickCurrentTime(onPickEnd)} disabled={!videoId}>
          종료 지점 지정
        </Button>
      </div>
    </div>
  );
}

function QuestionPreview({ question, questionType }: { question: LocalQuestion; questionType: QuestionType }) {
  const youtubeId = getYoutubeId(question.youtubeUrl);
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!question.imageFile || questionType !== 'IMAGE') {
      setCroppedImageUrl(null);
      return;
    }

    let cancelled = false;
    void cropImageToBlob(question.imageFile, 16 / 9, question.imageCropSettings).then((blob) => {
      if (cancelled) return;
      setCroppedImageUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [question.imageCropSettings, question.imageFile, questionType]);

  useEffect(() => {
    return () => {
      if (croppedImageUrl) URL.revokeObjectURL(croppedImageUrl);
    };
  }, [croppedImageUrl]);

  if (questionType === 'AUDIO') {
    return (
      <span className={styles.questionPreview}>
        {youtubeId ? <img alt="YouTube thumbnail" src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`} /> : <Play size={28} />}
      </span>
    );
  }

  if (questionType === 'IMAGE') {
    return (
      <span className={styles.questionPreview}>
        {croppedImageUrl || question.imageUrl ? <img alt="문제 이미지" src={croppedImageUrl ?? question.imageUrl ?? ''} /> : <ImagePlus size={28} />}
      </span>
    );
  }

  return (
    <span className={styles.questionPreview}>
      <strong>{questionTypeLabel('TEXT')}</strong>
    </span>
  );
}

function TimeField({
  label,
  value,
  errorText,
  inputRef,
  onChange,
}: {
  label: string;
  value: string;
  errorText?: string;
  inputRef?: RefObject<HTMLInputElement>;
  onChange: (value: string) => void;
}) {
  const [hh, mm, ss] = value.split(':');
  const setPart = (index: number, nextValue: string) => {
    const parts = [hh ?? '00', mm ?? '00', ss ?? '00'];
    parts[index] = nextValue.replace(/\D/g, '').slice(0, 2);
    onChange(parts.join(':'));
  };
  const normalizePart = (index: number) => {
    const parts = [hh ?? '', mm ?? '', ss ?? ''];
    const max = index === 0 ? 99 : 59;
    const parsed = Math.max(0, Math.min(max, Number(parts[index]) || 0));
    parts[index] = String(parsed).padStart(2, '0');
    onChange(parts.map((part) => (part === '' ? '00' : part.padStart(2, '0'))).join(':'));
  };

  return (
    <FormField
      label={label}
      errorText={errorText}
      tooltipText="시:분:초 형식입니다. YouTube 플레이어에서 현재 위치를 바로 지정할 수도 있습니다."
    >
      <div className={styles.timeInput}>
        <input
          ref={inputRef}
          inputMode="numeric"
          pattern="[0-9]*"
          value={hh ?? ''}
          onBlur={() => normalizePart(0)}
          onChange={(event) => setPart(0, event.target.value)}
        />
        <span>:</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={mm ?? ''}
          onBlur={() => normalizePart(1)}
          onChange={(event) => setPart(1, event.target.value)}
        />
        <span>:</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={ss ?? ''}
          onBlur={() => normalizePart(2)}
          onChange={(event) => setPart(2, event.target.value)}
        />
      </div>
    </FormField>
  );
}

function splitAnswers(value: string) {
  return value
    .split(',')
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function splitAnswersStrict(value: string) {
  return splitAnswers(value);
}

function normalizeAnswer(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function hasDuplicateAnswer(answers: string[]) {
  const normalized = answers.map(normalizeAnswer);
  return new Set(normalized).size !== normalized.length;
}

function editorSnapshot(state: EditorSnapshotState) {
  return JSON.stringify({
    ...state,
    thumbnailFile: state.thumbnailFile
      ? {
          name: state.thumbnailFile.name,
          size: state.thumbnailFile.size,
          lastModified: state.thumbnailFile.lastModified,
        }
      : null,
    questions: state.questions.map((question) => ({
      id: question.id,
      questionId: question.questionId,
      promptText: question.promptText,
      answersText: question.answersText,
      youtubeUrl: question.youtubeUrl,
      startTime: question.startTime,
      endTime: question.endTime,
      imageFile: question.imageFile
        ? {
            name: question.imageFile.name,
            size: question.imageFile.size,
            lastModified: question.imageFile.lastModified,
          }
        : null,
      imageAssetId: question.imageAssetId,
      imageUrl: question.imageUrl,
      imageCropSettings: question.imageCropSettings,
    })),
  });
}

function mergeQuestionProcessingState(current: LocalQuestion[], serverQuestions: MapEditorQuestion[]) {
  const serverById = new Map(serverQuestions.map((question) => [question.questionId, question]));
  return current.map((question) => {
    if (!question.questionId) return question;
    const media = serverById.get(question.questionId)?.media;
    if (!media) return question;
    return {
      ...question,
      processingStatus: media.processingStatus,
      failureCode: media.failureCode,
      failureType: media.failureType,
      failureMessage: media.failureMessage,
      canRetry: media.canRetry,
    };
  });
}

function hasActiveEditorAudioProcessing(editor?: MapEditorDetail) {
  if (editor?.status === 'DRAFT') return false;
  return editor?.questions.some((question) => {
    const status = question.media?.processingStatus;
    return status === 'QUEUED' || status === 'PROCESSING' || status === 'RETRYING';
  }) ?? false;
}

function summarizeEditorAudioProcessing(questions: LocalQuestion[]) {
  const tracked = questions.filter((question) => question.processingStatus);
  return {
    totalCount: tracked.length,
    readyCount: tracked.filter((question) => question.processingStatus === 'READY').length,
    queuedCount: tracked.filter((question) => question.processingStatus === 'QUEUED').length,
    processingCount: tracked.filter((question) => question.processingStatus === 'PROCESSING').length,
    retryingCount: tracked.filter((question) => question.processingStatus === 'RETRYING').length,
    failedCount: tracked.filter((question) => question.processingStatus === 'FAILED').length,
    sourceFailureCount: tracked.filter((question) => question.processingStatus === 'FAILED' && question.failureType === 'SOURCE').length,
    unresolvedSourceFailureCount: tracked.filter(
      (question) => question.processingStatus === 'FAILED' && question.failureType === 'SOURCE' && !question.sourceFailureResolved,
    ).length,
    resolvedSourceFailureCount: tracked.filter(
      (question) => question.processingStatus === 'FAILED' && question.failureType === 'SOURCE' && question.sourceFailureResolved,
    ).length,
    serverFailureCount: tracked.filter(
      (question) => question.processingStatus === 'FAILED' && question.failureType !== 'SOURCE',
    ).length,
    retryableFailedCount: tracked.filter(
      (question) => question.processingStatus === 'FAILED' && question.failureType !== 'SOURCE' && question.canRetry,
    ).length,
  };
}

function editorAudioSummaryText(summary: ReturnType<typeof summarizeEditorAudioProcessing>) {
  const parts: string[] = [];
  if (summary.queuedCount) parts.push(`대기 ${summary.queuedCount}`);
  if (summary.processingCount) parts.push(`처리 중 ${summary.processingCount}`);
  if (summary.retryingCount) parts.push(`자동 재시도 ${summary.retryingCount}`);
  if (summary.sourceFailureCount) parts.push(`영상 오류 ${summary.sourceFailureCount}`);
  if (summary.retryableFailedCount) parts.push(`서버 오류 ${summary.retryableFailedCount}`);
  return parts.length ? parts.join(' · ') : '모든 오디오 처리가 완료되었습니다.';
}

function questionProcessingLabel(question: LocalQuestion) {
  if (question.processingStatus === 'QUEUED') return '처리 대기';
  if (question.processingStatus === 'PROCESSING') return '오디오 처리 중';
  if (question.processingStatus === 'RETRYING') return '자동 재시도 중';
  if (question.processingStatus === 'READY') return '처리 완료';
  if (question.failureType === 'SOURCE') return '영상 수정 필요';
  return '서버 오류';
}

function failureTitle(question: LocalQuestion) {
  if (question.failureType === 'SOURCE') return '원본 영상을 처리할 수 없습니다.';
  return '오디오 처리 중 서버 오류가 발생했습니다.';
}

function audioFailureGuidance(question: LocalQuestion) {
  if (question.failureCode === 'INVALID_AUDIO_RANGE') {
    return '영상 링크 또는 시작·종료 범위를 수정한 뒤 맵을 저장해주세요.';
  }
  if (question.failureType === 'SOURCE') {
    return '재생 가능한 공개 영상 링크로 변경한 뒤 맵을 저장해주세요. 오류 문제를 삭제해도 됩니다.';
  }
  if (question.canRetry) {
    return '영상 오류를 수정해 저장하면 함께 다시 처리됩니다. 서버 오류만 남았다면 내가 만든 맵에서 다시 요청할 수 있습니다.';
  }
  return '잠시 후 상태를 다시 확인해주세요. 오류가 계속되면 이 문제를 삭제하거나 내용을 수정해주세요.';
}

function resolvesSourceFailure(question: LocalQuestion, original?: MapEditorQuestion) {
  const media = original?.media;
  if (media?.processingStatus !== 'FAILED' || media.failureType !== 'SOURCE') return false;

  const urlChanged = question.youtubeUrl.trim() !== (media.sourceUrl ?? '').trim();
  if (media.failureCode !== 'INVALID_AUDIO_RANGE') return urlChanged;
  return urlChanged || timeToMs(question.startTime) !== (media.startTimeMs ?? 0) || timeToMs(question.endTime) !== (media.endTimeMs ?? 0);
}

function getBasicError(title: string, categoryId: number) {
  if (!title.trim()) return '맵 제목을 입력해주세요.';
  if (title.trim().length < 2) return '맵 제목은 2자 이상 입력해주세요.';
  if (title.trim().length > 40) return '맵 제목은 40자 이하로 입력해주세요.';
  if (!categoryId) return '카테고리를 선택해주세요.';
  return '';
}

function mapSaveErrorMessage(messageCode: string) {
  if (messageCode === 'map_version_conflict') {
    return '다른 저장 내용이 먼저 반영되었습니다. 페이지를 새로고침한 뒤 다시 수정해주세요.';
  }
  if (messageCode === 'invalid_request') {
    return '맵 저장 요청이 올바르지 않습니다. 이미지, 정답, 시간 설정을 다시 확인해주세요.';
  }
  if (messageCode === 'forbidden_map_access') {
    return '이 맵을 수정할 권한이 없습니다.';
  }
  if (messageCode === 'map_or_question_not_found') {
    return '수정할 맵 또는 문제를 찾지 못했습니다.';
  }
  if (messageCode === 'audio_source_failure_not_resolved') {
    return '영상 오류가 해결되지 않았습니다. 영상 링크나 재생 범위를 실제로 변경하거나 해당 문제를 삭제해주세요.';
  }
  return `맵 저장에 실패했습니다. (${messageCode})`;
}

function getQuestionError(question: LocalQuestion, questionType: QuestionType) {
  return getQuestionValidation(question, questionType, question.youtubeDurationSeconds)?.message ?? '';
}

function isQuestionDirty(current: LocalQuestion, initial: LocalQuestion | null) {
  if (!initial) {
    return Boolean(
      current.promptText.trim() ||
        current.answersText.trim() ||
        current.youtubeUrl.trim() ||
        current.imageFile ||
        current.imageAssetId ||
        current.imageUrl,
    );
  }
  return (
    current.promptText !== initial.promptText ||
    current.answersText !== initial.answersText ||
    current.youtubeUrl !== initial.youtubeUrl ||
    current.startTime !== initial.startTime ||
    current.endTime !== initial.endTime ||
    current.imageFile !== initial.imageFile ||
    current.imageAssetId !== initial.imageAssetId ||
    current.imageUrl !== initial.imageUrl ||
    current.imageCropSettings.x !== initial.imageCropSettings.x ||
    current.imageCropSettings.y !== initial.imageCropSettings.y ||
    current.imageCropSettings.zoom !== initial.imageCropSettings.zoom ||
    current.imageCropSettings.fit !== initial.imageCropSettings.fit
  );
}

function isQuestionChanged(
  localQuestion: LocalQuestion,
  builtQuestion: BuiltQuestion,
  originalQuestion: MapEditorQuestion,
  questionType: QuestionType,
) {
  if (builtQuestion.promptText !== originalQuestion.promptText) return true;
  if (!areStringListsEqual(builtQuestion.answers, originalQuestion.answers)) return true;

  if (questionType === 'TEXT') {
    return originalQuestion.media !== null;
  }

  if (questionType === 'IMAGE') {
    if (localQuestion.imageFile) return true;
    return (builtQuestion.media?.assetId ?? null) !== (originalQuestion.media?.assetId ?? null);
  }

  return (
    (builtQuestion.media?.sourceType ?? null) !== (originalQuestion.media?.sourceType ?? null) ||
    (builtQuestion.media?.sourceUrl ?? '') !== (originalQuestion.media?.sourceUrl ?? '') ||
    (builtQuestion.media?.startTimeMs ?? null) !== (originalQuestion.media?.startTimeMs ?? null) ||
    (builtQuestion.media?.endTimeMs ?? null) !== (originalQuestion.media?.endTimeMs ?? null)
  );
}

function areStringListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getQuestionValidation(
  question: LocalQuestion,
  questionType: QuestionType,
  youtubeDurationSeconds?: number | null,
): { field: QuestionErrorField; message: string } | null {
  const answers = splitAnswersStrict(question.answersText);
  if (!question.promptText.trim()) return { field: 'prompt', message: '문제 지문을 입력해주세요.' };
  if (question.promptText.trim().length > 200) return { field: 'prompt', message: '문제 지문은 200자 이하로 입력해주세요.' };
  if (answers.length < 1) return { field: 'answers', message: '정답을 1개 이상 입력해주세요.' };
  if (answers.length > 20) return { field: 'answers', message: '정답은 최대 20개까지 입력할 수 있습니다.' };
  if (answers.some((answer) => answer.length > 50)) return { field: 'answers', message: '정답은 각각 50자 이하로 입력해주세요.' };
  if (hasDuplicateAnswer(answers)) return { field: 'answers', message: '중복된 정답이 있습니다.' };
  if (questionType === 'AUDIO' && !question.youtubeUrl.trim()) return { field: 'youtube', message: 'YouTube 링크를 입력해주세요.' };
  if (questionType === 'AUDIO' && !getYoutubeId(question.youtubeUrl)) return { field: 'youtube', message: 'YouTube 링크 형식을 확인해주세요.' };
  if (questionType === 'AUDIO' && timeToMs(question.endTime) <= timeToMs(question.startTime)) {
    return { field: 'endTime', message: '종료 시간이 시작 시간보다 늦어야 합니다.' };
  }
  if (questionType === 'AUDIO' && timeToMs(question.endTime) - timeToMs(question.startTime) < 1000) {
    return { field: 'endTime', message: '오디오 구간은 최소 1초 이상이어야 합니다.' };
  }
  if (questionType === 'AUDIO' && timeToMs(question.endTime) - timeToMs(question.startTime) > MAX_YOUTUBE_CLIP_SECONDS * 1000) {
    return { field: 'endTime', message: `오디오 구간은 최대 ${MAX_YOUTUBE_CLIP_SECONDS}초까지 설정할 수 있습니다.` };
  }
  if (questionType === 'AUDIO' && youtubeDurationSeconds && timeToMs(question.endTime) > youtubeDurationSeconds * 1000) {
    return { field: 'endTime', message: '종료 시간이 YouTube 영상 길이를 넘을 수 없습니다.' };
  }
  if (questionType === 'IMAGE' && !question.imageFile && !question.imageAssetId) {
    return { field: 'image', message: '문제 이미지를 선택해주세요.' };
  }
  return null;
}

function focusQuestionField(field: QuestionErrorField, refs: Record<QuestionErrorField, HTMLElement | null>) {
  const target = refs[field];
  window.setTimeout(() => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target instanceof HTMLInputElement) target.focus();
  }, 0);
}

function getYoutubeId(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v');
      const [, kind, id] = parsed.pathname.split('/');
      if (kind === 'embed' || kind === 'v' || kind === 'shorts') return id ?? null;
    }
  } catch {
    return trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1] ?? null;
  }

  return null;
}

function timeToMs(value: string) {
  const [hh = '0', mm = '0', ss = '0'] = value.split(':');
  return (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000;
}

function msToTime(value: number) {
  const totalSeconds = Math.floor(value / 1000);
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return [hh, mm, ss].map((part) => String(part).padStart(2, '0')).join(':');
}

function cleanDescription(value: string) {
  const trimmed = value.trim().slice(0, 500);
  return trimmed ? trimmed : null;
}

function remainingText(value: string, max: number) {
  return `${value.length}/${max}`;
}

type YoutubePlayerHandle = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration?: () => number;
};

type YoutubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    videoId: string;
    playerVars?: Record<string, number>;
    events?: {
      onReady?: (event: { target: YoutubePlayerHandle }) => void;
    };
  },
) => YoutubePlayerHandle;

declare global {
  interface Window {
    YT?: {
      Player: YoutubePlayerConstructor;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<{ Player: YoutubePlayerConstructor }> | null = null;

function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT!);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }
  });

  return youtubeApiPromise;
}
