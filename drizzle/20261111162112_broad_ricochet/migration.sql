CREATE TABLE `chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`voice_id` integer,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_chapters_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_chapters_voice_id_voices_id_fk` FOREIGN KEY (`voice_id`) REFERENCES `voices`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `configs` (
	`key` text PRIMARY KEY,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`path` text NOT NULL UNIQUE,
	`file_name` text NOT NULL,
	`file_mime` text NOT NULL,
	`file_size` integer NOT NULL,
	`duration_ms` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`llm_service_id` integer NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`metadata` text,
	`enabled` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_llm_models_llm_service_id_llm_services_id_fk` FOREIGN KEY (`llm_service_id`) REFERENCES `llm_services`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `llm_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`type` integer NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text,
	`settings` text,
	`enabled` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `narrators` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`voice_id` integer,
	`voice_settings` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_narrators_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_narrators_voice_id_voices_id_fk` FOREIGN KEY (`voice_id`) REFERENCES `voices`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `project_exports` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`project_id` integer NOT NULL,
	`file_id` integer NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_project_exports_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_project_exports_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`description` text,
	`cover_file_id` integer,
	`author` text,
	`voice_id` integer,
	`llm_model_id` integer,
	`prompt_id` integer,
	`settings` text,
	`last_opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_projects_cover_file_id_files_id_fk` FOREIGN KEY (`cover_file_id`) REFERENCES `files`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_projects_voice_id_voices_id_fk` FOREIGN KEY (`voice_id`) REFERENCES `voices`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_projects_llm_model_id_llm_models_id_fk` FOREIGN KEY (`llm_model_id`) REFERENCES `llm_models`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_projects_prompt_id_prompts_id_fk` FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`enabled` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`chapter_id` integer NOT NULL,
	`narrator_id` integer,
	`voice_id` integer,
	`generation_id` integer,
	`content` text,
	`voice_settings` text,
	`sort_order` integer NOT NULL,
	`is_stale` integer DEFAULT true,
	`leading_silence` integer,
	`trailing_silence` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_segments_chapter_id_chapters_id_fk` FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_segments_narrator_id_narrators_id_fk` FOREIGN KEY (`narrator_id`) REFERENCES `narrators`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_segments_voice_id_voices_id_fk` FOREIGN KEY (`voice_id`) REFERENCES `voices`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `tts_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`project_id` integer NOT NULL,
	`segment_id` integer,
	`file_id` integer NOT NULL,
	`payload` text,
	`service_url` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_tts_generations_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_tts_generations_segment_id_segments_id_fk` FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_tts_generations_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `tts_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`type` integer NOT NULL,
	`base_url` text NOT NULL,
	`preview_base_url` text,
	`bearer_token` text,
	`capabilities` text,
	`sample_rate` integer,
	`settings` text,
	`enabled` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_designs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`tts_service_id` integer,
	`instruct` text NOT NULL,
	`input` text NOT NULL,
	`file_id` integer,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_voice_designs_tts_service_id_tts_services_id_fk` FOREIGN KEY (`tts_service_id`) REFERENCES `tts_services`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_voice_designs_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `voices` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`tts_service_id` integer NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`metadata` text,
	`preview_url` text,
	`prompt_text` text,
	`enabled` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_voices_tts_service_id_tts_services_id_fk` FOREIGN KEY (`tts_service_id`) REFERENCES `tts_services`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_chapter_project_order` ON `chapters` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `uni_llm_service_model` ON `llm_models` (`llm_service_id`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uni_narrator_project_name` ON `narrators` (`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_project_exports_project_created` ON `project_exports` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_segment_chapter_order` ON `segments` (`chapter_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `ix_tts_generation_segment` ON `tts_generations` (`segment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_tts_generation_project` ON `tts_generations` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_voice_design_created` ON `voice_designs` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uni_service_voice` ON `voices` (`tts_service_id`,`key`);