import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMessage, Question } from '../../services/project';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-question-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './question-panel.html',
  styleUrls: ['./question-panel.scss']
})
export class QuestionPanelComponent {
  private toastService = inject(ToastService);

  @Input({ required: true }) message!: ChatMessage;
  @Input() projectImageAssets: { path: string; name: string }[] = [];

  @Output() submitted = new EventEmitter<ChatMessage>();
  @Output() cancelled = new EventEmitter<ChatMessage>();
  @Output() answerUpdated = new EventEmitter<{ msg: ChatMessage; questionId: string; value: any }>();
  @Output() checkboxToggled = new EventEmitter<{ msg: ChatMessage; questionId: string; optionValue: string }>();
  @Output() defaultsAccepted = new EventEmitter<ChatMessage>();

  focusedQuestionIndex = signal(-1);
  focusedOptionIndex = signal(-1);

  submitQuestionAnswers() {
    this.submitted.emit(this.message);
  }

  cancelQuestion() {
    this.resetQuestionKeyboardFocus();
    this.cancelled.emit(this.message);
  }

  updateQuestionAnswer(questionId: string, value: any) {
    this.answerUpdated.emit({ msg: this.message, questionId, value });
  }

  toggleCheckboxOption(questionId: string, optionValue: string) {
    this.checkboxToggled.emit({ msg: this.message, questionId, optionValue });
  }

  isCheckboxOptionSelected(questionId: string, optionValue: string): boolean {
    if (!this.message.pendingQuestion) return false;
    const currentValue = this.message.pendingQuestion.answers[questionId] || [];
    return currentValue.includes(optionValue);
  }

  canSubmitQuestions(): boolean {
    if (!this.message.pendingQuestion) return false;

    for (const q of this.message.pendingQuestion.questions) {
      if (q.required) {
        const answer = this.message.pendingQuestion.answers[q.id];
        if (answer === undefined || answer === null || answer === '' ||
            (Array.isArray(answer) && answer.length === 0)) {
          return false;
        }
      }
    }
    return true;
  }

  hasDefaultAnswers(): boolean {
    if (!this.message.pendingQuestion) return false;
    return this.message.pendingQuestion.questions.some(q => q.default !== undefined);
  }

  acceptDefaults() {
    this.defaultsAccepted.emit(this.message);
  }

  onQuestionPanelKeydown(event: KeyboardEvent) {
    if (!this.message.pendingQuestion) return;

    const questions = this.message.pendingQuestion.questions;
    const currentQIndex = this.focusedQuestionIndex();
    const currentOIndex = this.focusedOptionIndex();

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (this.canSubmitQuestions()) {
        this.submitQuestionAnswers();
      }
      return;
    }

    if (event.key === 'd' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (this.hasDefaultAnswers()) {
        this.acceptDefaults();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateDown(questions, currentQIndex, currentOIndex);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateUp(questions, currentQIndex, currentOIndex);
        break;

      case 'ArrowRight':
      case 'Tab':
        if (!event.shiftKey) {
          if (currentQIndex < questions.length - 1) {
            event.preventDefault();
            this.focusedQuestionIndex.set(currentQIndex + 1);
            this.focusedOptionIndex.set(0);
          }
        }
        break;

      case 'ArrowLeft':
        if (currentQIndex > 0) {
          event.preventDefault();
          this.focusedQuestionIndex.set(currentQIndex - 1);
          const prevQ = questions[currentQIndex - 1];
          if (prevQ.options) {
            this.focusedOptionIndex.set(0);
          } else {
            this.focusedOptionIndex.set(-1);
          }
        }
        break;

      case 'Enter':
      case ' ':
        if (currentQIndex >= 0 && currentQIndex < questions.length) {
          const q = questions[currentQIndex];
          if (q.type === 'text') {
            if (event.key === ' ') return;
          } else if (q.options && currentOIndex >= 0 && currentOIndex < q.options.length) {
            event.preventDefault();
            const opt = q.options[currentOIndex];
            if (q.type === 'radio') {
              this.updateQuestionAnswer(q.id, opt.value);
            } else if (q.type === 'checkbox') {
              this.toggleCheckboxOption(q.id, opt.value);
            }
          }
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.cancelQuestion();
        break;
    }
  }

  private navigateDown(questions: Question[], qIndex: number, oIndex: number) {
    if (qIndex < 0) {
      this.focusedQuestionIndex.set(0);
      this.focusedOptionIndex.set(questions[0]?.options ? 0 : -1);
      return;
    }

    const currentQ = questions[qIndex];
    if (currentQ.options && oIndex < currentQ.options.length - 1) {
      this.focusedOptionIndex.set(oIndex + 1);
    } else if (qIndex < questions.length - 1) {
      this.focusedQuestionIndex.set(qIndex + 1);
      this.focusedOptionIndex.set(questions[qIndex + 1]?.options ? 0 : -1);
    }
  }

  private navigateUp(questions: Question[], qIndex: number, oIndex: number) {
    if (qIndex < 0) return;

    const currentQ = questions[qIndex];
    if (currentQ.options && oIndex > 0) {
      this.focusedOptionIndex.set(oIndex - 1);
    } else if (qIndex > 0) {
      const prevQ = questions[qIndex - 1];
      this.focusedQuestionIndex.set(qIndex - 1);
      if (prevQ.options) {
        this.focusedOptionIndex.set(prevQ.options.length - 1);
      } else {
        this.focusedOptionIndex.set(-1);
      }
    }
  }

  initQuestionKeyboardFocus() {
    if (!this.message.pendingQuestion || this.message.pendingQuestion.questions.length === 0) return;

    this.focusedQuestionIndex.set(0);
    const firstQ = this.message.pendingQuestion.questions[0];
    this.focusedOptionIndex.set(firstQ.options ? 0 : -1);
  }

  resetQuestionKeyboardFocus() {
    this.focusedQuestionIndex.set(-1);
    this.focusedOptionIndex.set(-1);
  }

  isOptionFocused(qIndex: number, oIndex: number): boolean {
    return this.focusedQuestionIndex() === qIndex && this.focusedOptionIndex() === oIndex;
  }

  isTextInputFocused(qIndex: number): boolean {
    return this.focusedQuestionIndex() === qIndex && this.focusedOptionIndex() === -1;
  }

  isCustomUploadedImage(question: Question): boolean {
    if (!this.message.pendingQuestion) return false;
    const answer = this.message.pendingQuestion.answers[question.id];
    if (!answer) return false;
    if (!question.options || question.options.length === 0) return true;
    return !question.options.find(o => o.value === answer);
  }

  handleQuestionImageUpload(event: Event, questionId: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toastService.show('Please select an image file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        this.updateQuestionAnswer(questionId, dataUrl);
      }
    };
    reader.onerror = () => {
      this.toastService.show('Failed to read image file', 'error');
    };
    reader.readAsDataURL(file);

    input.value = '';
  }
}
