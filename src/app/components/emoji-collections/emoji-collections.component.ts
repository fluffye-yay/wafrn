import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';
import { Subscription } from 'rxjs';
import { Emoji } from 'src/app/interfaces/emoji';
import { EmojiCollection } from 'src/app/interfaces/emoji-collection';
import { MessageService } from 'src/app/services/message.service';
import { PostsService } from 'src/app/services/posts.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-emoji-collections',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, FontAwesomeModule, FormsModule, MatInputModule
  ],
  templateUrl: './emoji-collections.component.html',
  styleUrl: './emoji-collections.component.scss'
})
export class EmojiCollectionsComponent implements OnDestroy{
  copyIcon = faCopy;
  filterText = "";
  emojiCollections: EmojiCollection[] = []
  subscription: Subscription;
  @Output() emoji: EventEmitter<string> = new EventEmitter<string>()

  baseMediaUrl = environment.baseMediaUrl

  constructor(private postService: PostsService) {
    this.subscription = this.postService.updateFollowers.subscribe(() => {
      this.emojiCollections = this.postService.emojiCollections
    })
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  click(emoji: Emoji) {
    this.emoji.emit(emoji.name)
  }

}