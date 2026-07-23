import { Component, ElementRef, input, output, ViewChild} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

interface Data {
  name: string
  file: any
}

@Component({
    selector: "app-template-file-upload",
    imports: [
        MatIconModule,
        MatButtonModule,
    ],
    templateUrl: "./file-upload.component.html",
    styleUrls: ["./file-upload.component.scss"]
})
export class TemplateFileUploadComponent {

  valid = input<boolean>(false);
  fileContent = output<string>();

  @ViewChild('fileInput') inputNode: ElementRef<any> | undefined

  private selectedFile: string | undefined;
  name: string | undefined


  onUploadFileSelected() {
    let fileObject = this.inputNode?.nativeElement.files[0];
    if (!fileObject) {
      return;
    }

    if (typeof FileReader !== "undefined") {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        this.selectedFile = e.target.result;
        if(this.selectedFile !== undefined)
          this.fileContent.emit(this.selectedFile)
      };

      this.name = fileObject.name;
      reader.readAsText(fileObject);
    }
  }

}
